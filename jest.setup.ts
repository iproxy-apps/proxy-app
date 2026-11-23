import 'react-native-gesture-handler/jestSetup'

jest.mock('react-native-reanimated', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-reanimated/mock'),
)

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3333'
process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_jest'
