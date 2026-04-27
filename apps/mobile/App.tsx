import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Platform, SafeAreaView } from 'react-native';
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

export default function App() {
  const [view, setView] = useState<'login' | 'home' | 'camera' | 'preview' | 'browse'>('login');
  const [browseUrl, setBrowseUrl] = useState('https://posterlink.co.kr/posters');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    // 푸시 알림 설정
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification Received:', notification);
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const linkUrl = response.notification.request.content.data?.link_url as string | undefined;
      if (linkUrl) {
        const targetUrl = `https://posterlink.co.kr${linkUrl}`;
        setBrowseUrl(targetUrl);
        setView('browse');
      }
    });

    // 생체인식 지원 여부 확인
    Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hasHardware, isEnrolled]) => {
      setBiometricAvailable(hasHardware && isEnrolled);
    });

    // 기존 세션 확인 — 세션 있으면 생체인식으로 잠금 해제 유도
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setHasStoredSession(true);
        // 생체인식 가능하면 로그인 화면 유지 (버튼으로 해제)
        // 불가능하면 자동 로그인
        LocalAuthentication.hasHardwareAsync().then(async (hasHardware) => {
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();
          if (hasHardware && isEnrolled) {
            setView('login');
          } else {
            setUser(session.user);
            setView('home');
          }
        });
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // 토큰 저장은 user/token 둘 다 준비됐을 때만
  useEffect(() => {
    if (user && expoPushToken) {
      supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', user.id);
    }
  }, [user, expoPushToken]);

  async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) {
      console.log('실제 기기에서만 푸시 알림이 작동합니다.');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('알림 권한이 거부되었습니다.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId,
    })).data;
    return token;
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
        setView('home');
      } else {
        Alert.alert('세션 만료', '다시 로그인해주세요.');
        setHasStoredSession(false);
      }
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('오류', error.message);
    else if (data.user) {
      setUser(data.user);
      setView('home');
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
            setView('home');
          }
        }
      }
    } catch (err: any) {
      Alert.alert('로그인 오류', err?.message ?? '소셜 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
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

      // poster 초안 생성 + thumbnail_url 직접 저장
      const { error: dbError } = await supabase.from('posters').insert({
        title: `현장 수집_${new Date().toLocaleDateString()}`,
        poster_status: 'draft',
        created_by: user.id,
        thumbnail_url: publicUrl,
      });
      if (dbError) throw dbError;

      Alert.alert('완료', '포스터 사진이 업로드되었습니다. 웹 대시보드에서 내용을 입력하고 검수를 요청해주세요.');
      setView('home');
      setCapturedImage(null);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (view === 'login') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>PosterLink OPS</Text>
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

        <TouchableOpacity
          onPress={() => handleSocialLogin('kakao')}
          style={styles.kakaoButton}
          disabled={loading}
        >
          <Text style={styles.kakaoButtonText}>K  카카오로 시작하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleSocialLogin('google')}
          style={styles.googleButton}
          disabled={loading}
        >
          <Text style={styles.googleButtonText}>G  구글로 시작하기</Text>
        </TouchableOpacity>

        {biometricAvailable && hasStoredSession && (
          <TouchableOpacity onPress={handleBiometricLogin} style={styles.biometricButton}>
            <Text style={styles.biometricButtonText}>
              {Platform.OS === 'ios' ? '🔒 Face ID / Touch ID로 로그인' : '🔒 지문으로 로그인'}
            </Text>
          </TouchableOpacity>
        )}
        <StatusBar style="auto" />
      </View>
    );
  }

  if (view === 'home') {
    return (
      <View style={styles.container}>
        <View style={{ marginBottom: 40, alignItems: 'center' }}>
          <Text style={styles.welcome}>안녕하세요, {user?.email?.split('@')[0]}님</Text>
          {expoPushToken ? (
            <Text style={styles.statusText}>✅ 알림 수신 대기 중</Text>
          ) : (
            <Text style={styles.statusTextDisabled}>❌ 알림 비활성 (실기기 권장)</Text>
          )}
        </View>

        <TouchableOpacity onPress={() => setView('camera')} style={styles.captureButton}>
          <Text style={styles.captureButtonText}>📸 포스터 촬영 시작</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setView('browse')} style={styles.browseButton}>
          <Text style={styles.browseButtonText}>🔍 공고 탐색하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => supabase.auth.signOut().then(() => { setUser(null); setView('login'); })}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (view === 'browse') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.webviewHeader}>
          <TouchableOpacity onPress={() => setView('home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 홈으로</Text>
          </TouchableOpacity>
          <Text style={styles.webviewTitle}>공고 탐색</Text>
          <View style={{ width: 70 }} />
        </View>
        <WebView
          source={{ uri: browseUrl }}
          style={{ flex: 1 }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.webviewLoading}>
              <ActivityIndicator size="large" color="#1e3a8a" />
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  if (view === 'camera') {
    if (!permission) return <View />;
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={{ marginBottom: 20, fontWeight: 'bold', color: '#374151' }}>카메라 접근 권한이 필요합니다.</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.primaryButton}>
            <Text style={styles.buttonText}>권한 허용</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView style={{ flex: 1 }} ref={cameraRef}>
          {/* 포스터 가이드 오버레이 */}
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
            <TouchableOpacity onPress={() => setView('home')} style={styles.iconButton}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={takePicture} style={styles.shutterButton} />
            <View style={{ width: 40 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  if (view === 'preview') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedImage! }} style={styles.previewImage} />
        <View style={styles.previewControls}>
          <TouchableOpacity onPress={() => setView('camera')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>재촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={uploadPoster} style={styles.primaryButton} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>등록</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: '900', color: '#1e3a8a', marginBottom: 40, letterSpacing: -1 },
  welcome: { fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  statusText: { fontSize: 12, fontWeight: 'bold', color: '#10b981' },
  statusTextDisabled: { fontSize: 12, fontWeight: 'bold', color: '#9ca3af' },
  input: { width: '100%', height: 60, backgroundColor: '#f9fafb', borderRadius: 16, paddingHorizontal: 20, marginBottom: 12, fontSize: 16, fontWeight: 'bold' },
  primaryButton: { width: '100%', height: 60, backgroundColor: '#1e3a8a', borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#1e3a8a', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  captureButton: { width: '100%', height: 120, backgroundColor: '#6ee7b7', borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20, shadowColor: '#6ee7b7', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  captureButtonText: { fontSize: 22, fontWeight: '900', color: '#1e3a8a' },
  cameraControls: { position: 'absolute', bottom: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  shutterButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'white', borderWidth: 6, borderColor: 'rgba(255,255,255,0.3)' },
  previewImage: { width: '100%', height: '70%', borderRadius: 32, marginBottom: 24 },
  previewControls: { width: '100%', flexDirection: 'row', gap: 12 },
  secondaryButton: { flex: 1, height: 60, backgroundColor: '#f3f4f6', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#4b5563', fontWeight: 'bold' },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#f3f4f6' },
  dividerText: { marginHorizontal: 12, color: '#9ca3af', fontSize: 13, fontWeight: 'bold' },
  kakaoButton: { width: '100%', height: 56, backgroundColor: '#FEE500', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  kakaoButtonText: { color: '#3c1e1e', fontSize: 15, fontWeight: 'bold' },
  googleButton: { width: '100%', height: 56, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  googleButtonText: { color: '#374151', fontSize: 15, fontWeight: 'bold' },
  biometricButton: { marginTop: 6, width: '100%', height: 56, backgroundColor: '#f0fdf4', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#6ee7b7' },
  biometricButtonText: { color: '#059669', fontSize: 15, fontWeight: 'bold' },
  browseButton: { width: '100%', height: 64, backgroundColor: '#eff6ff', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1.5, borderColor: '#bfdbfe' },
  browseButtonText: { fontSize: 17, fontWeight: 'bold', color: '#1e3a8a' },
  webviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  webviewTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  backButton: { paddingVertical: 6, paddingHorizontal: 4 },
  backButtonText: { color: '#1e3a8a', fontWeight: 'bold', fontSize: 15 },
  webviewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  linkButton: { marginTop: 24 },
  linkText: { color: '#9ca3af', fontWeight: 'bold', textDecorationLine: 'underline' },
  iconButton: { padding: 10 },
  guideOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  guideBox: { width: '75%', aspectRatio: 3 / 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 16, position: 'relative' },
  guideCorner: { position: 'absolute', width: 24, height: 24, borderColor: '#3b82f6' },
  guideTopLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  guideTopRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  guideBottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  guideBottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  guideText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 'bold', marginTop: 16, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
