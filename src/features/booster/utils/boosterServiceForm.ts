import type { BoosterService } from '@/types'

export interface ServiceFormData {
  title: string
  description: string
  service_type: string
  unit: string
  tempo: string
  price: string
  requirements: string
  availability_note: string
  rules: string
}

export const EMPTY_SERVICE_FORM: ServiceFormData = {
  title: '', description: '', service_type: 'boosting', unit: 'fixed',
  tempo: '', price: '', requirements: '', availability_note: '', rules: '',
}

export function serviceToForm(s: BoosterService): ServiceFormData {
  return {
    title: s.title,
    description: s.description ?? '',
    service_type: s.service_type ?? 'boosting',
    unit: s.unit || 'fixed',
    tempo: s.tempo ?? '',
    price: String(s.price),
    requirements: s.requirements ?? '',
    availability_note: s.availability_note ?? '',
    rules: s.rules ?? '',
  }
}
