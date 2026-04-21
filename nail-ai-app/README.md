# NailAI APK (Expo + React Native + Firebase)

Arquitectura base para una app de diseño de uñas con IA, autenticación, tokens, referidos y monetización.

## Estructura de carpetas

```text
nail-ai-app/
├─ app.json
├─ package.json
├─ src/
│  ├─ navigation/
│  │  └─ AppNavigator.tsx
│  ├─ screens/
│  │  ├─ LoginScreen.tsx
│  │  ├─ CameraScreen.tsx
│  │  ├─ ResultScreen.tsx
│  │  ├─ ClosetScreen.tsx
│  │  └─ PaywallModal.tsx
│  ├─ services/
│  │  ├─ firebase.ts
│  │  ├─ analyzeNailsWithAI.ts
│  │  └─ tokenService.ts
│  ├─ contexts/
│  │  └─ AuthContext.tsx
│  ├─ components/
│  │  ├─ NailPalette.tsx
│  │  └─ TechniqueBadge.tsx
│  ├─ types/
│  │  └─ nails.ts
│  └─ utils/
│     ├─ imageCompression.ts
│     └─ share.ts
└─ firebase/
   ├─ firestore.rules
   └─ functions/
      ├─ package.json
      └─ src/
         └─ index.ts
```

## Flujo técnico

1. Usuario inicia sesión por Email/Password o Google.
2. Al validar email (`emailVerified === true`), backend asigna tokens iniciales (20) si no existen.
3. Usuario toma foto de mano y la app comprime imagen.
4. App consume `analyzeNailsWithAI(imageBase64)` (Cloud Function) para no exponer API key.
5. Cloud Function descuenta 1 token (si no es premium), llama OpenAI `gpt-4o` multimodal y guarda historial.
6. Si tokens llegan a 0 y no es premium, app muestra paywall de $99 MXN/mes.
7. Guardar diseño en `users/{uid}/favorites` y compartir en redes.
8. Referidos: cuando invitado verifica email, se suman 20 tokens al usuario que lo refirió.

## Build APK con Expo

- Desarrollo: `npx expo start`
- Android APK/AAB: `eas build -p android`

