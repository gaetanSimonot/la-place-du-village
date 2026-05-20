import CovoitConversationClient from './client'

export default async function Page({ params }: { params: Promise<{ convId: string }> }) {
  const { convId } = await params
  return <CovoitConversationClient convId={convId} />
}
