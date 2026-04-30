import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Image, TextInput,
  Alert, ActivityIndicator, Platform, StatusBar as RNStatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './src/lib/supabase';
import { StatusBar } from 'expo-status-bar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const HOME_URL = 'https://www.posterlink.kr';
const SB_PROJECT = 'zxndgzsfrgwahwsdbjdj';

// 웹앱 Supabase 세션을 2초마다 체크해서 네이티브로 전달
const SESSION_BRIDGE_JS = `
  (function() {
    const KEY = 'sb-${SB_PROJECT}-auth-token';
    function getCookie(name) {
      var m = document.cookie.match(new RegExp('(^|;\\\\s*)' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[2]) : null;
    }
    function checkSession() {
      try {
        var raw = getCookie(KEY) || localStorage.getItem(KEY);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'auth',
          payload: raw ? JSON.parse(raw) : null
        }));
      } catch(e) {}
    }
    checkSession();
    setInterval(checkSession, 2000);
    true;
  })();
`;

type AppView = 'browse' | 'camera' | 'preview';

export default function App() {
  const [view, setView] = useState<AppView>('browse');
  const [browseUrl, setBrowseUrl] = useState(HOME_URL);
  const [user, setUser] = useState<any>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const webViewRef = useRef<any>(null);
  const cameraRef = useRef<CameraView>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const lastUserId = useRef<string | null>(null);

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

    // 네이티브 기존 세션 복원
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        lastUserId.current = session.user.id;
      }
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

  // 웹앱 세션 → 네이티브 세션 동기화
  const handleWebMessage = useCallback(async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type !== 'auth') return;

      const payload = msg.payload;
      if (payload?.access_token && payload?.user) {
        // 새로운 사용자 세션이면 네이티브 Supabase에도 세션 설정
        if (lastUserId.current !== payload.user.id) {
          lastUserId.current = payload.user.id;
          await supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token,
          });
          setUser(payload.user);
        }
      } else if (!payload && lastUserId.current) {
        // 웹에서 로그아웃된 경우
        lastUserId.current = null;
        await supabase.auth.signOut();
        setUser(null);
      }
    } catch {}
  }, []);

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: async () => {
          lastUserId.current = null;
          await supabase.auth.signOut();
          setUser(null);
          // 웹앱도 로그아웃 (로그아웃 페이지로 이동)
          webViewRef.current?.injectJavaScript(`
            fetch('/api/auth/sign-out', { method: 'POST' }).finally(() => {
              window.location.href = '/';
            });
            true;
          `);
        },
      },
    ]);
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

  // ── 카메라 ──────────────────────────────────────────────────────
  if (view === 'camera') {
    if (!permission) return <View />;
    if (!permission.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permText}>카메라 접근 권한이 필요합니다.</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.btn}>
            <Text style={styles.btnText}>권한 허용</Text>
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
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <Text style={styles.guideText}>포스터를 프레임에 맞춰주세요</Text>
          </View>
          <View style={styles.camControls}>
            <TouchableOpacity onPress={() => setView('browse')} style={styles.camBtn}>
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={takePicture} style={styles.shutter} />
            <View style={{ width: 50 }} />
          </View>
        </CameraView>
      </View>
    );
  }

  // ── 미리보기 ────────────────────────────────────────────────────
  if (view === 'preview') {
    return (
      <View style={styles.centered}>
        <StatusBar style="dark" />
        <Image source={{ uri: capturedImage! }} style={styles.preview} />
        <View style={styles.previewRow}>
          <TouchableOpacity onPress={() => setView('camera')} style={styles.secBtn}>
            <Text style={styles.secBtnText}>재촬영</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={uploadPoster} style={[styles.btn, { flex: 1 }]} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>등록</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 메인 (풀스크린 WebView) ──────────────────────────────────────
  return (
    <View style={{ flex: 1, paddingTop: RNStatusBar.currentHeight ?? 0, backgroundColor: '#fff' }}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: browseUrl }}
        style={{ flex: 1 }}
        startInLoadingState
        injectedJavaScript={SESSION_BRIDGE_JS}
        onMessage={handleWebMessage}
        onNavigationStateChange={navState => {
          if (navState.url) setBrowseUrl(navState.url);
        }}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        )}
      />

      {/* 카메라 FAB — 로그인 시에만 표시, 탭바 위에 위치 */}
      {user && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setView('camera')}
          onLongPress={handleLogout}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>📸</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  permText: { marginBottom: 20, fontWeight: 'bold', color: '#374151', fontSize: 16, textAlign: 'center' },
  btn: { width: '100%', height: 56, backgroundColor: '#1e3a8a', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  secBtn: { flex: 1, height: 56, backgroundColor: '#f3f4f6', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  secBtnText: { color: '#4b5563', fontWeight: 'bold', fontSize: 16 },

  // Camera
  camControls: { position: 'absolute', bottom: 60, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  shutter: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'white', borderWidth: 6, borderColor: 'rgba(255,255,255,0.3)' },
  camBtn: { padding: 12 },
  guideOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  guideBox: { width: '75%', aspectRatio: 3 / 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 16, position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#3b82f6' },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bl: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 16 },
  br: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 16 },
  guideText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 'bold', marginTop: 16, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  // Preview
  preview: { width: '100%', height: '70%', borderRadius: 24, marginBottom: 24 },
  previewRow: { width: '100%', flexDirection: 'row', gap: 12 },

  // WebView loading
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  // FAB: 웹앱 하단 탭바(~65px) + 여유(20px) = bottom 85
  fab: {
    position: 'absolute',
    bottom: 85,
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e3a8a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  fabIcon: { fontSize: 24 },
});
