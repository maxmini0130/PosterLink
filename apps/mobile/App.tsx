import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './src/lib/supabase';
import { StatusBar } from 'expo-status-bar';

// 알림 수신 설정 (앱이 켜져 있을 때)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [view, setView] = useState<'login' | 'home' | 'camera' | 'preview'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState('');
  
  const cameraRef = useRef<Camera>(null);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    // 1. 카메라 권한 체크
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();

    // 2. 푸시 알림 토큰 요청 및 저장
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    // 3. 알림 수신 리스너
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification Received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification Clicked:', response);
    });

    // 4. 기존 세션 확인
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        setView('home');
        if (expoPushToken) saveTokenToDB(data.user.id, expoPushToken);
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [expoPushToken]);

  const saveTokenToDB = async (userId: string, token: string) => {
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
  };

  async function registerForPushNotificationsAsync() {
    let token;
    if (Device.isDevice) {
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
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })).data;
    } else {
      console.log('실제 기기에서만 푸시 알림이 작동합니다.');
    }

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  }

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Error', error.message);
    else {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser(data.user);
        setView('home');
        if (expoPushToken) saveTokenToDB(data.user.id, expoPushToken);
      }
    }
    setLoading(false);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      setCapturedImage(photo.uri);
      setView('preview');
    }
  };

  const uploadPoster = async () => {
    if (!capturedImage || !user) return;
    setLoading(true);
    
    try {
      const fileName = `${user.id}/${Date.now()}_mobile.jpg`;
      const formData = new FormData();
      formData.append('file', {
        uri: capturedImage,
        name: fileName,
        type: 'image/jpeg',
      } as any);

      // 1. Storage 업로드
      const { error: storageError } = await supabase.storage.from('poster-originals').upload(fileName, formData);
      if (storageError) throw storageError;

      // Public URL 가져오기
      const { data: { publicUrl } } = supabase.storage.from('poster-originals').getPublicUrl(fileName);

      // 2. DB 초안 생성 (최신 컬럼명 반영)
      const { data: poster, error: dbError } = await supabase.from('posters').insert({
        title: `현장 수집_${new Date().toLocaleDateString()}`,
        poster_status: 'draft',
        created_by: user.id,
      }).select().single();

      if (dbError) throw dbError;

      // 3. 이미지 정보 저장 (Public URL 저장)
      await supabase.from('poster_images').insert({
        poster_id: poster.id,
        image_type: 'original',
        image_url: publicUrl
      });

      Alert.alert('Success', '포스터 현장 사진이 업로드되었습니다. 웹 대시보드에서 보정을 진행해주세요.');
      setView('home');
      setCapturedImage(null);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (view === 'login') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>PosterLink OPS</Text>
        <TextInput placeholder="Email" value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" />
        <TextInput placeholder="Password" value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />
        <TouchableOpacity onPress={handleLogin} style={styles.primaryButton} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
        </TouchableOpacity>
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
             <Text style={styles.statusTextDisabled}>❌ 알림 비활성 상태 (실기기 권장)</Text>
           )}
        </View>

        <TouchableOpacity onPress={() => setView('camera')} style={styles.captureButton}>
          <Text style={styles.captureButtonText}>📸 포스터 촬영 시작</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => supabase.auth.signOut().then(() => setView('login'))} style={styles.linkButton}>
          <Text style={styles.linkText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (view === 'camera') {
    if (hasPermission === null) return <View />;
    if (hasPermission === false) return <Text>No access to camera</Text>;
    return (
      <View style={{ flex: 1 }}>
        <Camera style={{ flex: 1 }} ref={cameraRef}>
          <View style={styles.cameraControls}>
            <TouchableOpacity onPress={() => setView('home')} style={styles.iconButton}>
              <Text style={{color: 'white', fontWeight: 'bold'}}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={takePicture} style={styles.shutterButton} />
            <View style={{ width: 40 }} />
          </View>
        </Camera>
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
  linkButton: { marginTop: 24 },
  linkText: { color: '#9ca3af', fontWeight: 'bold', textDecorationLine: 'underline' },
  iconButton: { padding: 10 },
});
