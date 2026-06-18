import { User } from 'lucide-react-native'

import { Button } from '../../../src/components/Button'
import { TabPlaceholder } from '../../../src/components/TabPlaceholder'
import { useProxyAuth } from '../../../src/hooks/useProxyAuth'

export default function Profile() {
  const { signOut } = useProxyAuth()

  return (
    <TabPlaceholder
      Icon={User}
      title="Perfil"
      subtitle="Sua conta e preferências."
      description="Em breve você editará seus dados, alternará entre Cliente e Proxy e gerenciará sua conta por aqui."
      footer={
        <Button variant="outline" size="lg" fullWidth onPress={signOut}>
          Sair
        </Button>
      }
    />
  )
}
