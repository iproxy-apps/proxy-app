import { Home as HomeIcon } from 'lucide-react-native'

import { ClientHome } from '@/feature/home/components/ClientHome'
import { useProxyAuth } from '@/feature/auth/hooks/useProxyAuth'
import { TabPlaceholder } from '@/shared/components/TabPlaceholder'

export default function Home() {
  const { session } = useProxyAuth()

  if (!session) return null

  if (session.userType === 'CLIENT') {
    return <ClientHome session={session} />
  }

  const firstName = session.name?.split(' ')[0] ?? 'por aí'

  return (
    <TabPlaceholder
      Icon={HomeIcon}
      title={`Olá, ${firstName}`}
      subtitle="Veja tarefas disponíveis perto de você."
      description="Em breve você verá tarefas prontas pra aceitar, com valor e distância."
    />
  )
}
