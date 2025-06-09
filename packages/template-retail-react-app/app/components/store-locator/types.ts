import {useSearchStores} from '@salesforce/commerce-sdk-react'

export type Stores = NonNullable<ReturnType<typeof useSearchStores>['data']>['data']
export type Store = Stores[number]