/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {createRemoteJWKSet as joseCreateRemoteJWKSet, jwtVerify, decodeJwt} from 'jose'
import {
    createRemoteJWKSet,
    validateSlasCallbackToken
} from '@salesforce/retail-react-app/app/utils/jwt-utils'
import {getAppOrigin} from '@salesforce/pwa-kit-react-sdk/utils/url'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

const MOCK_JWKS = {
    keys: [
        {
            kty: 'EC',
            crv: 'P-256',
            use: 'sig',
            kid: '8edb82b1-f6d5-49c1-bab2-c0d152ee3d0b',
            x: 'i8e53csluQiqwP6Af8KsKgnUceXUE8_goFcvLuSzG3I',
            y: 'yIH500tLKJtPhIl7MlMBOGvxQ_3U-VcrrXusr8bVr_0'
        },
        {
            kty: 'EC',
            crv: 'P-256',
            use: 'sig',
            kid: 'da9effc5-58cb-4a9c-9c9c-2919fb7d5e5e',
            x: '_tAU1QSvcEkslcrbNBwx5V20-sN87z0zR7gcSdBETDQ',
            y: 'ZJ7bgy7WrwJUGUtzcqm3MNyIfawI8F7fVawu5UwsN8E'
        },
        {
            kty: 'EC',
            crv: 'P-256',
            use: 'sig',
            kid: '5ccbbc6e-b234-4508-90f3-3b9b17efec16',
            x: '9ULO2Atj5XToeWWAT6e6OhSHQftta4A3-djgOzcg4-Q',
            y: 'JNuQSLMhakhLWN-c6Qi99tA5w-D7IFKf_apxVbVsK-g'
        }
    ]
}

jest.mock('@salesforce/pwa-kit-react-sdk/utils/url', () => ({
    getAppOrigin: jest.fn()
}))

jest.mock('@salesforce/pwa-kit-runtime/utils/ssr-config', () => ({
    getConfig: jest.fn()
}))

jest.mock('jose', () => ({
    createRemoteJWKSet: jest.fn(),
    jwtVerify: jest.fn(),
    decodeJwt: jest.fn()
}))

describe('createRemoteJWKSet', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('constructs the correct JWKS URI and call joseCreateRemoteJWKSet', () => {
        const mockTenantId = 'aaaa_001'
        const mockAppOrigin = 'https://test-storefront.com'
        getAppOrigin.mockReturnValue(mockAppOrigin)
        getConfig.mockReturnValue({
            app: {
                commerceAPI: {
                    parameters: {
                        shortCode: 'abc123',
                        organizationId: 'f_ecom_aaaa_001'
                    }
                }
            }
        })
        joseCreateRemoteJWKSet.mockReturnValue('mockJWKSet')

        const expectedJWKS_URI = new URL(`${mockAppOrigin}/abc123/aaaa_001/oauth2/jwks`)

        const res = createRemoteJWKSet(mockTenantId)

        expect(getAppOrigin).toHaveBeenCalled()
        expect(getConfig).toHaveBeenCalled()
        expect(joseCreateRemoteJWKSet).toHaveBeenCalledWith(expectedJWKS_URI)
        expect(res).toBe('mockJWKSet')
    })
})

describe('validateSlasCallbackToken', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        const mockAppOrigin = 'https://test-storefront.com'
        getAppOrigin.mockReturnValue(mockAppOrigin)
        getConfig.mockReturnValue({
            app: {
                commerceAPI: {
                    parameters: {
                        shortCode: 'abc123',
                        organizationId: 'f_ecom_aaaa_001'
                    }
                }
            }
        })
        joseCreateRemoteJWKSet.mockReturnValue(MOCK_JWKS)
    })

    it('returns payload when callback token is valid', async () => {
        decodeJwt.mockReturnValue({iss: 'slas/dev/aaaa_001'})
        const mockPayload = {sub: '123', role: 'admin'}
        jwtVerify.mockResolvedValue({payload: mockPayload})

        const res = await validateSlasCallbackToken('mock.slas.token')

        expect(jwtVerify).toHaveBeenCalledWith('mock.slas.token', MOCK_JWKS, {})
        expect(res).toEqual(mockPayload)
    })

    it('throws validation error when the token is invalid', async () => {
        decodeJwt.mockReturnValue({iss: 'slas/dev/aaaa_001'})
        const mockError = new Error('Invalid token')
        jwtVerify.mockRejectedValue(mockError)

        await expect(validateSlasCallbackToken('mock.slas.token')).rejects.toThrow(
            mockError.message
        )
        expect(jwtVerify).toHaveBeenCalledWith('mock.slas.token', MOCK_JWKS, {})
    })

    it('throws mismatch error when the config tenantId does not match the jwt tenantId', async () => {
        decodeJwt.mockReturnValue({iss: 'slas/dev/zzrf_001'})
        await expect(validateSlasCallbackToken('mock.slas.token')).rejects.toThrow()
    })
})
