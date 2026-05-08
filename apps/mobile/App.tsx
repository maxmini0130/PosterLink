import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Image, TextInput,
  Alert, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as ExpoLinking from 'expo-linking';
import { supabase } from './src/lib/supabase';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const HOME_URL = 'https://www.posterlink.kr';
const SB_PROJECT = 'zxndgzsfrgwahwsdbjdj';
const MOBILE_OAUTH_REDIRECT_URI = ExpoLinking.createURL('auth-callback');
const LEGACY_MOBILE_OAUTH_REDIRECT_URI = 'com.maxmini.posterlink://auth-callback';

// 웹앱 Supabase 세션을 2초마다 체크해서 네이티브로 전달
const SESSION_BRIDGE_JS = `
  (function() {
    const KEY = 'sb-${SB_PROJECT}-auth-token';
    function decodeBase64Url(value) {
      try {
        var normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        while (normalized.length % 4) normalized += '=';
        return atob(normalized);
      } catch (e) {
        return null;
      }
    }
    function readCookieChunks(name) {
      var cookies = document.cookie
        .split(';')
        .map(function(part) { return part.trim(); })
        .filter(Boolean)
        .map(function(part) {
          var separatorIndex = part.indexOf('=');
          return separatorIndex === -1
            ? null
            : {
                name: part.slice(0, separatorIndex),
                value: decodeURIComponent(part.slice(separatorIndex + 1))
              };
        })
        .filter(function(part) {
          return part && (part.name === name || part.name.indexOf(name + '.') === 0);
        })
        .sort(function(a, b) {
          var left = a.name === name ? -1 : parseInt(a.name.slice(name.length + 1), 10);
          var right = b.name === name ? -1 : parseInt(b.name.slice(name.length + 1), 10);
          return left - right;
        });

      if (!cookies.length) return null;
      return cookies.map(function(part) { return part.value; }).join('');
    }
    function readSession() {
      var raw = readCookieChunks(KEY) || localStorage.getItem(KEY);
      if (!raw) return null;
      if (raw.indexOf('base64-') === 0) {
        raw = decodeBase64Url(raw.slice('base64-'.length));
      }
      return raw ? JSON.parse(raw) : null;
    }
    function checkSession() {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'auth',
          payload: readSession()
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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const webViewRef = useRef<any>(null);
  const cameraRef = useRef<CameraView>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();
  const lastUserId = useRef<string | null>(null);
  const isMobileOAuthCallback = useCallback((url: string) => (
    url.startsWith(MOBILE_OAUTH_REDIRECT_URI) ||
    url.startsWith(LEGACY_MOBILE_OAUTH_REDIRECT_URI)
  ), []);

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

    // OAuth 딥링크 수신 → 토큰 파싱 후 세션 적용
    const handleDeepLink = async ({ url }: { url: string }) => {
      if (!isMobileOAuthCallback(url)) return;
      // implicit flow: #access_token=...&refresh_token=...
      const hash = url.includes('#') ? url.split('#')[1] : '';
      const query = url.includes('?') ? url.split('?')[1] : '';
      const hp = new URLSearchParams(hash);
      const qp = new URLSearchParams(query);
      const accessToken = hp.get('access_token');
      const refreshToken = hp.get('refresh_token');
      const code = qp.get('code');
      if (accessToken && refreshToken) {
        await applyOAuthTokens(accessToken, refreshToken);
      } else if (code) {
        await applyOAuthSession(code);
      }
    };
    const linkingSub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then(url => { if (url) handleDeepLink({ url }); });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
      linkingSub.remove();
    };
  }, [isMobileOAuthCallback]);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('role, expo_push_token').eq('id', user.id).single().then(({ data }) => {
        if (data) {
          setUserRole(data.role);
          if (expoPushToken && data.expo_push_token !== expoPushToken) {
            supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', user.id);
          }
        }
      });
    } else {
      setUserRole(null);
    }
  }, [user, expoPushToken]);

  // WebView에 세션 주입하는 공통 함수
  const injectSessionToWebView = useCallback((session: any, user: any) => {
    setUser(user);
    lastUserId.current = user.id;
    setView('browse');
    setBrowseUrl(HOME_URL);
    const sessionStr = JSON.stringify(session);
    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          var KEY = 'sb-${SB_PROJECT}-auth-token';
          var MAX_CHUNK_SIZE = 3180;
          var SESSION_JSON = ${JSON.stringify(sessionStr)};
          function base64UrlEncode(value) {
            var utf8 = unescape(encodeURIComponent(value));
            var base64 = btoa(utf8);
            return base64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
          }
          function clearAuthCookies() {
            document.cookie
              .split(';')
              .map(function(part) { return part.trim(); })
              .filter(Boolean)
              .forEach(function(part) {
                var separatorIndex = part.indexOf('=');
                var name = separatorIndex === -1 ? part : part.slice(0, separatorIndex);
                if (name === KEY || name.indexOf(KEY + '.') === 0) {
                  document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax';
                }
              });
          }
          function writeAuthCookies(value) {
            var encoded = 'base64-' + base64UrlEncode(value);
            clearAuthCookies();
            if (encoded.length <= MAX_CHUNK_SIZE) {
              document.cookie = KEY + '=' + encoded + '; path=/; max-age=34560000; samesite=lax';
              return;
            }
            for (var i = 0; i * MAX_CHUNK_SIZE < encoded.length; i++) {
              var chunk = encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE);
              document.cookie = KEY + '.' + i + '=' + chunk + '; path=/; max-age=34560000; samesite=lax';
            }
          }
          localStorage.setItem(KEY, SESSION_JSON);
          writeAuthCookies(SESSION_JSON);
          window.location.replace('/');
        } catch(e) {}
      })();
      true;
    `);
  }, []);

  // implicit flow: access_token + refresh_token 직접 사용
  const applyOAuthTokens = useCallback(async (accessToken: string, refreshToken: string) => {
    const { data: sd, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sd?.session && sd.user) {
      injectSessionToWebView(sd.session, sd.user);
    } else {
      Alert.alert('로그인 실패', error?.message ?? '인증 처리 중 오류가 발생했습니다.');
    }
  }, [injectSessionToWebView]);

  // PKCE flow: code 교환 (fallback)
  const applyOAuthSession = useCallback(async (code: string) => {
    const { data: sd, error } = await supabase.auth.exchangeCodeForSession(code);
    if (sd?.session && sd.user) {
      injectSessionToWebView(sd.session, sd.user);
    } else {
      Alert.alert('로그인 실패', error?.message ?? '인증 처리 중 오류가 발생했습니다.');
    }
  }, [injectSessionToWebView]);

  // WebView OAuth URL 감지 → 네이티브 PKCE + Chrome Custom Tab
  const oauthInProgress = useRef(false);
  const handleNativeOAuth = useCallback(async (authorizeUrl: string) => {
    if (oauthInProgress.current) return;
    oauthInProgress.current = true;
    try {
      const urlParams = new URLSearchParams(authorizeUrl.split('?')[1] || '');
      const provider = urlParams.get('provider') as 'google' | 'kakao' | null;
      if (provider !== 'google' && provider !== 'kakao') return;

      const { data } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: MOBILE_OAUTH_REDIRECT_URI,
          skipBrowserRedirect: true,
          ...(provider === 'kakao' && { scopes: 'profile_nickname profile_image' }),
        },
      });
      if (!data?.url) {
        Alert.alert('로그인 실패', `${provider} 로그인 URL을 생성하지 못했습니다.`);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, MOBILE_OAUTH_REDIRECT_URI);
      if (result.type === 'success') {
        const callbackUrl = (result as any).url as string | undefined;
        if (callbackUrl) {
          const hash = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : '';
          const query = callbackUrl.includes('?') ? callbackUrl.split('?')[1] : '';
          const hp = new URLSearchParams(hash);
          const qp = new URLSearchParams(query);
          const accessToken = hp.get('access_token');
          const refreshToken = hp.get('refresh_token');
          const code = qp.get('code');
          if (accessToken && refreshToken) {
            await applyOAuthTokens(accessToken, refreshToken);
          } else if (code) {
            await applyOAuthSession(code);
          }
        }
      } else if (result.type !== 'cancel') {
        Alert.alert('로그인 실패', `${provider} 로그인 콜백을 받지 못했습니다. Redirect URL 설정을 확인해주세요.`);
      }
      // Android: Linking 이벤트로도 처리 (handleDeepLink)
    } finally {
      oauthInProgress.current = false;
    }
  }, [applyOAuthSession, applyOAuthTokens]);

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
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: browseUrl }}
        style={{ flex: 1 }}
        startInLoadingState
        scalesPageToFit={false}
        injectedJavaScriptBeforeContentLoaded={`
          (function() {
            var meta = document.querySelector('meta[name="viewport"]');
            if (meta) {
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
            } else {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
              document.head.appendChild(meta);
            }
          })();
          true;
        `}
        onLoadStart={({ nativeEvent }) => {
          if (nativeEvent.url.includes('supabase.co/auth/v1/authorize')) {
            webViewRef.current?.stopLoading();
            handleNativeOAuth(nativeEvent.url);
          }
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.includes('supabase.co/auth/v1/authorize')) {
            handleNativeOAuth(request.url);
            return false;
          }
          return true;
        }}
        injectedJavaScript={SESSION_BRIDGE_JS}
        onMessage={handleWebMessage}
        onNavigationStateChange={navState => {
          if (navState.url && !navState.url.includes('supabase.co/auth')) {
            setBrowseUrl(navState.url);
          }
        }}
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#1e3a8a" />
          </View>
        )}
      />

      {/* FAB — 역할에 따라 분기 */}
      {user && userRole !== null && (
        ['operator', 'admin', 'super_admin'].includes(userRole) ? (
          // 운영자/관리자: 카메라 촬영
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setView('camera')}
            onLongPress={handleLogout}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>📸</Text>
          </TouchableOpacity>
        ) : (
          // 일반 사용자: 포스터 등록 요청
          <TouchableOpacity
            style={[styles.fab, styles.fabRequest]}
            onPress={() => {
              setBrowseUrl(`${HOME_URL}/posters/request`);
              setView('browse');
            }}
            onLongPress={handleLogout}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>📌</Text>
          </TouchableOpacity>
        )
      )}
      </SafeAreaView>
    </SafeAreaProvider>
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
  fabRequest: {
    backgroundColor: '#4f46e5',
  },
  fabIcon: { fontSize: 24 },
});
