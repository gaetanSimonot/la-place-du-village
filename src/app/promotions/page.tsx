import { Metadata } from 'next'
import PromotionsClient from './client'

export const metadata: Metadata = {
  title: 'Promotions locales — La Place du Village',
  description: 'Offres exclusives chez vos commerçants locaux',
}

export default function PromotionsPage() {
  return <PromotionsClient />
}
