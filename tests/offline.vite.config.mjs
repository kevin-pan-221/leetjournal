import react from '@vitejs/plugin-react'
// Optional isolated native QA entry; never included in the production build.
export default {
  plugins: [react()],
  build: { outDir: 'dist-offline-qa', rollupOptions: { input: ['tests/offline-preview.html','tests/offline-native-preview.html','tests/offline-native-autotest.html'] } },
}
