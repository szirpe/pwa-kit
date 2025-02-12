/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {createRemoteJWKSet as joseCreateRemoteJWKSet, jwtVerify, decodeJwt} from 'jose'
import {getAppOrigin} from '@salesforce/pwa-kit-react-sdk/utils/url'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

const CLAIM = {
    ISSUER: 'iss'
}

const DELIMITER = {
    ISSUER: '/'
}

const throwSlasTokenValidationError = (message, code) => {
    throw new Error(`SLAS Token Validation Error: ${message}`, code)
}

export const createRemoteJWKSet = (tenantId) => {
    const appOrigin = getAppOrigin()
    const {app: appConfig} = getConfig()
    const shortCode = appConfig.commerceAPI.parameters.shortCode
    const configTenantId = appConfig.commerceAPI.parameters.organizationId.replace(/^f_ecom_/, '')
    if (tenantId !== configTenantId) {
        throw new Error(
            `The tenant ID in your PWA Kit configuration ("${configTenantId}") does not match the tenant ID in the SLAS callback token ("${tenantId}").`
        )
    }
    const JWKS_URI = `${appOrigin}/${shortCode}/${tenantId}/oauth2/jwks`
    return joseCreateRemoteJWKSet(new URL(JWKS_URI))
}

export const validateSlasCallbackToken = async (token) => {
    const payload = decodeJwt(token)
    const subClaim = payload[CLAIM.ISSUER]
    const tokens = subClaim.split(DELIMITER.ISSUER)
    const tenantId = tokens[2]
    try {
        const jwks = createRemoteJWKSet(tenantId)
        const {payload} = await jwtVerify(token, jwks, {})
        return payload
    } catch (error) {
        throwSlasTokenValidationError(error.message, 401)
    }
}

const tenantIdRegExp = /^[a-zA-Z]{4}_([0-9]{3}|s[0-9]{2}|stg|dev|prd)$/
const shortCodeRegExp = /^[a-zA-Z0-9-]+$/

/**
 *  Handles JWKS (JSON Web Key Set) caching the JWKS response for 2 weeks.
 *
 * @param {object} req Express request object.
 * @param {object} res Express response object.
 * @param {object} options Options for fetching B2C Commerce API JWKS.
 * @param {string} options.shortCode - The Short Code assigned to the realm.
 * @param {string} options.tenantId - The Tenant ID for the ECOM instance.
 * @returns {Promise<*>} Promise with the JWKS data.
 */
export async function jwksCaching(req, res, options) {
    const {shortCode, tenantId} = options

    const isValidRequest = tenantIdRegExp.test(tenantId) && shortCodeRegExp.test(shortCode)
    if (!isValidRequest)
        return res
            .status(400)
            .json({error: 'Bad request parameters: Tenant ID or short code is invalid.'})
    try {
        const JWKS_URI = `https://${shortCode}.api.commercecloud.salesforce.com/shopper/auth/v1/organizations/f_ecom_${tenantId}/oauth2/jwks`
        const response = await fetch(JWKS_URI)

        if (!response.ok) {
            throw new Error('Request failed with status: ' + response.status)
        }

        // JWKS rotate every 30 days. For now, cache response for 14 days so that
        // fetches only need to happen twice a month
        res.set('Cache-Control', 'public, max-age=1209600, stale-while-revalidate=86400')

        return res.json(await response.json())
    } catch (error) {
        res.status(400).json({error: `Error while fetching data: ${error.message}`})
    }
}
