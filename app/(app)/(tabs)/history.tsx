import { History as HistoryIcon } from 'lucide-react-native'

import { TabPlaceholder } from '@/shared/components/TabPlaceholder'

export default function History() {
  return (
    <TabPlaceholder
      Icon={HistoryIcon}
      title="Histórico"
      subtitle="Tudo o que você já fez por aqui."
      description="Em breve você verá tarefas concluídas, canceladas e poderá filtrar por período."
    />
  )
}
