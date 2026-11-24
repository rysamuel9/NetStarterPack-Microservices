# NetStarterPack Mobile (React Native + Expo)

Starterpack aplikasi mobile untuk mengonsumsi seluruh microservice **NetStarterPack (.NET 10)** melalui satu pintu **`Gateway.Api` (`:5080`)**. Dirancang agar 100% kompatibel dengan **Expo Go** (langsung bisa dites di HP fisik Android/iOS tanpa wajib install Android Studio).

## Tech Stack Utama
- **Expo (New Architecture)** + **TypeScript** + **Expo Router** (file-based routing & deep linking)
- **TanStack Query + AsyncStorage Persistence** (*stale-while-revalidate* & cache offline)
- **Zustand** (Auth session, RBAC `hasPermission`, Dynamic Menus, Light/Dark Theme)
- **Axios** dengan **Single-Flight Refresh Token Queue** & penyimpanan token aman via **`expo-secure-store`**
- **`expo-local-authentication`** (Biometric Unlock: Sidik Jari / Face ID)
- **`lucide-react-native`** (sinkron 1:1 dengan ikon `MenuItems` di `Identity.Api`)
- **`@microsoft/signalr`**, **React Hook Form + Zod**, **`@react-native-community/netinfo`**

## Cara Menjalankan di HP Fisik (Expo Go)

1. **Install Expo Go** di HP Android (Play Store) atau iOS (App Store).
2. **Nyalakan Backend dengan akses LAN**:
   - Di Visual Studio, pilih launch profile **`Start All Microservices + Mobile LAN Access (:5080)`** pada `Gateway.Api`, atau lewat terminal:
     ```powershell
     dotnet run --project src/ApiGateway/Gateway.Api --launch-profile "Start All Microservices + Mobile LAN Access (:5080)"
     ```
   - Cek IP LAN PC Windows kamu lewat `ipconfig` (contoh: `192.168.1.15`). Pastikan PC & HP berada di Wi-Fi yang sama.
3. **Jalankan Expo Dev Server**:
   ```powershell
   cd mobile
   npm install
   npx expo start
   ```
4. **Scan QR Code** yang muncul di terminal menggunakan **Expo Go** di HP.
5. Di pojok kanan atas layar **Login**, ketuk chip **Server URL** (ikon gerigi), masukkan `http://<IP-LAN-PC>:5080`, klik **Tes Koneksi**, lalu **Simpan**.

## Typecheck & Build Rilis Terpisah (EAS)
- Cek TypeScript: `npm run typecheck`
- Build preview `.apk` (independen dari backend/web): `eas build --profile preview --platform android`
- Build production `.aab`/`.ipa`: `eas build --profile production --platform all`
