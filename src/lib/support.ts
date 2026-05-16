export type SupportConvStatut = 'open' | 'closed'

export interface SupportConversation {
  id: string
  user_id: string
  statut: SupportConvStatut
  subject: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  closed_by: string | null
}

export interface SupportMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  sender_is_admin: boolean
  content: string
  lu_at: string | null
  created_at: string
}

export interface SupportConversationListItem extends SupportConversation {
  user: { user_id: string; display_name: string | null; avatar_url: string | null; email: string | null } | null
  last_message: SupportMessage | null
  unread_count: number
}
