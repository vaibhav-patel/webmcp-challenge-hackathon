import { useSyncExternalStore } from 'react'
import { store } from '../model/store'

export function useStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
