/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import fetchMock from 'jest-fetch-mock'
import {emailLink} from '@salesforce/retail-react-app/app/utils/marketing-cloud/marketing-cloud-email-link'

const fetchOriginal = global.fetch
const originalEnv = process.env

beforeAll(() => {
    global.fetch = fetchMock
    global.fetch.mockResponse(JSON.stringify({}))
    process.env = {
        ...originalEnv,
        MARKETING_CLOUD_CLIENT_ID: 'mc_client_id',
        MARKETING_CLOUD_CLIENT_SECRET: 'mc_client_secret',
        MARKETING_CLOUD_SUBDOMAIN: 'mc_subdomain.com'
    }
})

afterAll(() => {
    global.fetch = fetchOriginal
    process.env = originalEnv
})

describe('emailLink()', () => {
    it('should send an email with a magic link', async () => {
        const email = 'test@example.com'
        const templateId = '123'
        const magicLink = 'https://magic-link.example.com'
        await emailLink(email, templateId, magicLink)

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fetch).toHaveBeenNthCalledWith(
            1,
            `https://${process.env.MARKETING_CLOUD_SUBDOMAIN}.auth.marketingcloudapis.com/v2/token`,
            {
                body: JSON.stringify({
                    grant_type: 'client_credentials',
                    client_id: process.env.MARKETING_CLOUD_CLIENT_ID,
                    client_secret: process.env.MARKETING_CLOUD_CLIENT_SECRET
                }),
                headers: {'Content-Type': 'application/json'},
                method: 'POST'
            }
        )
        expect(fetch).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining(
                `https://${process.env.MARKETING_CLOUD_SUBDOMAIN}.rest.marketingcloudapis.com/messaging/v1/email/messages/`
            ),
            {
                body: JSON.stringify({
                    definitionKey: templateId,
                    recipient: {contactKey: email, to: email, attributes: {'magic-link': magicLink}}
                }),
                headers: expect.objectContaining({'Content-Type': 'application/json'}),
                method: 'POST'
            }
        )
    })
})
