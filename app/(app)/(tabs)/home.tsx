import { Home as HomeIcon } from 'lucide-react-native'

import { TabPlaceholder } from '../../../src/components/TabPlaceholder'
import { useProxyAuth } from '../../../src/hooks/useProxyAuth'

export default function Home() {
  const { session } = useProxyAuth()
  const isProxy = session?.userType === 'PROXY'
  const firstName = session?.name?.split(' ')[0] ?? 'por aí'

  return (
    <TabPlaceholder
      Icon={HomeIcon}
      title={`Olá, ${firstName}`}
      subtitle={
        isProxy
          ? 'Veja tarefas disponíveis perto de você.'
          : 'Acompanhe suas tarefas e contrate quem você precisa.'
      }
      description={
        isProxy
          ? 'Em breve você verá tarefas prontas pra aceitar, com valor e distância.'
          : 'Em breve você criará tarefas em segundos e acompanhará tudo em andamento.'
      }
    />
  )
}
