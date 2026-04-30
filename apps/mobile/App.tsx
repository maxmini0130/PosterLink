import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Image, TextInput,
  Alert, ActivityIndicator, Platform, SafeAreaView, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './src/lib/supabase';
import { StatusBar } from 'expo-status-bar';

WebBrowser.maybeCompleteAuthSession();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const HOME_URL = 'https://www.posterlink.kr';

type View = 'browse' | 'camera' | 'preview';

export default function App() {
  const [view, setView] = useState<View>('browse');
  const [browseUrl, setBrowseUrl] = useState(HOME_URL);
  const [loginVisible, setLoginVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const webViewRef = useRef<any>(null);
  const cameraRef = useRef<CameraView>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const linkUrl = response.notification.request.content.data?.link_url as string | undefined;
      if (linkUrl) {
        setBrowseUrl(`${HOME_URL}${linkUrl}`);
        setView('browse');
      }
    });

    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hasHardware, isEnrolled]) => {
      setBiometricAvailable(hasHardware && isEnrolled);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  useEffect(() => {
    if (user && expoPushToken) {
      supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', user.id);
    }
  }, [user, expoPushToken]);

  async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    return (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })).data;
  }

  const handleBiometricLogin = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'PosterLink 로그인',
      fallbackLabel: '비밀번호 사용',
      cancelLabel: '취소',
    });
    if (result.success) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setLoginVisible(false);
      } else {
        Alert.alert('세션 만료', '다시 로그인해주세요.');
      }
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('오류', error.message);
    else if (data.user) {
      setUser(data.user);
      setLoginVisible(false);
    }
    setLoading(false);
  };

  const handleSocialLogin = async (provider: 'kakao' | 'google') => {
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          ...(provider === 'kakao' && { scopes: 'profile_nickname profile_image' }),
        },
      });
      if (error || !data?.url) throw error ?? new Error('OAuth URL 생성 실패');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        const parsed = new URL(result.url);
        const code = parsed.searchParams.get('code');
        if (code) {
          const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
          if (sessionError) throw sessionError;
          if (sessionData.user) {
            setUser(sessionData.user);
            setLoginVisible(false);
          }
        }
      }
    } catch (err: any) {
      Alert.alert('로그인 오류', err?.message ?? '소셜 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: () => supabase.auth.signOut().then(() => setUser(null)),
      },
    ]);
  };

  const handleFabPress = () => {
    if (user) {
      setView('camera');
    } else {
      setLoginVisible(true);
    }
  };

  const handleFabLongPress = () => {
    if (user) handleLogout();
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo) {
        setCapturedImage(photo.uri);
        setView('preview');
      }
    }
  };

  const uploadPoster = async () => {
    if (!capturedImage || !user) return;
    setLoading(true);
    try {
      const fileName = `${user.id}/${Date.now()}_mobile.jpg`;
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const { error: storageError } = await supabase.storage
        .from('poster-originals')
        .upload(fileName, blob, { contentType: 'image/jpeg' });
      if (storageError) throw storageError;
      const { data: { publicUrl } } = supabase.storage.from('poster-originals').getPublicUrl(fileName);
      const { error: dbError } = await supabase.from('posters').insert({
        title: `현장 수집_${new Date().toLocaleDateString()}`,
        poster_status: 'draft',
        created_by: user.id,
        thumbnail_url: publicUrl,
      });
      if (dbError) throw dbError;
      Alert.alert('완료', '포스터 사진이 업로드되었습니다.\n웹 대시보드에서 내용을 입력하고 검수를 요청해주세요.');
      setView('browse');
      setCapturedImage(null);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 카메라 ────────────────────────────────────────────────────
  if (view === 'camera') {
    if (!permission) return <View />;
    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionText}>카메라 접근 권한이 필요합니다.</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.primaryButton}>
            <Text style={styles.buttonText}>권한 허용</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <CameraView style={{ flex: 1 }} ref={cameraRef}>
          <View style={styles.guideOverlay}>
            <View style={styles.guideBox}>
              <View style={[styles.guideCorner, styles.guideTopLeft]} />
              <View style={[styles.guideCorner, styles.guideTopRight]} />
              <View style={[styles.guideCorner, styles.guideBottomLeft]} />
              <View style={[styles.guideCorner, styles.guideBottomRight]} />
            </View>
            <Text style={styles.guideText}>포스터를 프레임에 맞춰주세요</Text>
          </View>
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={() => setView('browse')} style={styles.iconButton}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={takePicture} style={styles.shutterButton} />
            <View style={{ width: 50 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  // ── 미리보기 ──────────────────────────────────────────────────
  if (view === 'preview') {
    return (
      <View style={styles.centered}>
        <StatusBar style="dark" />
        <Image source={{ uri: capturedImage! }} style={styles.previewImage} />
        <View style={styles.previewControls}>
          <TouchableOpacity onPress={() => setView('camera')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>재촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={uploadPoster} style={[styles.primaryButton, { flex: 1 }]} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>등록</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 메인 (Browse + FAB + Login Modal) ────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: browseUrl }}
        style={{ flex: 1 }}
        startInLoadingState
        onNavigationStateChange={navState => {
          if (navState.url) setBrowseUrl(navState.url);
        }}
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        )}
      />

      {/* 카메라 / 로그인 FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleFabPress}
        onLongPress={handleFabLongPress}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>{user ? '📸' : '🔑'}</Text>
      </TouchableOpacity>

      {/* 로그인 Modal */}
      <Modal
        visible={loginVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setLoginVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>로그인</Text>

            <TextInput
              placeholder="이메일"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              placeholder="비밀번호"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />
            <TouchableOpacity onPress={handleLogin} style={styles.primaryButton} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? '로그인 중...' : '이메일로 로그인'}</Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>간편 로그인</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity onPress={() => handleSocialLogin('kakao')} style={styles.kakaoButton} disabled={loading}>
              <Text style={styles.kakaoButtonText}>K  카카오로 시작하기</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSocialLogin('google')} style={styles.googleButton} disabled={loading}>
              <Text style={styles.googleButtonText}>G  구글로 시작하기</Text>
            </TouchableOpacity>

            {biometricAvailable && (
              <TouchableOpacity onPress={handleBiometricLogin} style={styles.biometricButton}>
                <Text style={styles.biometricButtonText}>
                  {Platform.OS === 'ios' ? '🔒 Face ID / Touch ID' : '🔒 지문으로 로그인'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setLoginVisible(false)} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionText: { marginBottom: 20, fontWeight: 'bold', color: '#374151', fontSize: 16 },

  // Buttons
  primaryButton: { width: '100%', height: 56, backgroundColor: '#1e3a8a', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  secondaryButton: { flex: 1, height: 56, backgroundColor: '#f3f4f6', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#4b5563', fontWeight: 'bold', fontSize: 16 },
  kakaoButton: { width: '100%', height: 52, backgroundColor: '#FEE500', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  kakaoButtonText: { color: '#3c1e1e', fontSize: 15, fontWeight: 'bold' },
  googleButton: { width: '100%', height: 52, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  googleButtonText: { color: '#374151', fontSize: 15, fontWeight: 'bold' },
  biometricButton: { width: '100%', height: 52, backgroundColor: '#f0fdf4', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#6ee7b7', marginBottom: 10 },
  biometricButtonText: { color: '#059669', fontSize: 15, fontWeight: 'bold' },
  cancelButton: { width: '100%', height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: '#9ca3af', fontSize: 15 },

  // Input
  input: { width: '100%', height: 56, backgroundColor: '#f9fafb', borderRadius: 14, paddingHorizontal: 18, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#f3f4f6' },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#f3f4f6' },
  dividerText: { marginHorizontal: 12, color: '#9ca3af', fontSize: 13, fontWeight: 'bold' },

  // FAB
  fab: { position: 'absolute', bottom: 28, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: '#1e3a8a', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabIcon: { fontSize: 26 },

  // Login Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#1e3a8a', marginBottom: 20, textAlign: 'center' },

  // Camera
  cameraControls: { position: 'absolute', bottom: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  shutterButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'white', borderWidth: 6, borderColor: 'rgba(255,255,255,0.3)' },
  iconButton: { padding: 12 },
  guideOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  guideBox: { width: '75%', aspectRatio: 3 / 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16, position: 'relative' },
  guideCorner: { position: 'absolute', width: 24, height: 24, borderColor: '#3b82f6' },
  guideTopLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  guideTopRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  guideBottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  guideBottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  guideText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 'bold', marginTop: 16, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  // Preview
  previewImage: { width: '100%', height: '70%', borderRadius: 24, marginBottom: 24 },
  previewControls: { width: '100%', flexDirection: 'row', gap: 12 },

  // WebView
  webviewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
