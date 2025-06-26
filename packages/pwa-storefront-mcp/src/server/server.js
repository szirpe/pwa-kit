#!/usr/bin/env node
/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'
import {AddComponentTool} from '../utils/AddComponentTool.js'
import {InsertExistingComponentTool} from '../utils/InsertExistingComponentTool.js'
import {CreateNewComponentTool} from '../utils/CreateNewComponentTool.js'
import fs from 'fs/promises'
import path from 'path'
import {fileURLToPath} from 'url'
import {StorefrontDevelopmentGuide} from '../utils/pwa-storefront-development-guide.js'
import {HookRecommenderTool} from '../utils/HookRecommenderTool.js'
import process from 'process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class PwaStorefrontMCPServerHighLevel {
    constructor() {
        // Using McpServer instead of Server
        this.server = new McpServer(
            {
                name: 'pwa-storefront-mcp-server',
                version: '0.1.0'
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        )

        this.addComponentTool = new AddComponentTool()
        this.insertExistingComponentTool = new InsertExistingComponentTool()
        this.CreateNewComponentTool = new CreateNewComponentTool()
        this.hookRecommenderTool = new HookRecommenderTool()

        this.setupTools()

        // 1. Add in-memory session management
        this.sessions = {}
        this.sessionCounter = 1
    }

    setupTools() {
        // Register pwa-developing-guide tool
        this.server.tool(
            StorefrontDevelopmentGuide.name,
            StorefrontDevelopmentGuide.description,
            {},
            StorefrontDevelopmentGuide.fn
        )

        this.server.tool(
            'analyze_code_structure',
            'Analyze JavaScript/React code structure to identify components, imports, and insertion points',
            {
                code: z.string().describe('The JavaScript/React code to analyze')
            },
            async (args) => {
                try {
                    const analysis = this.addComponentTool.analyzeCodeStructure(args.code)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        analysis,
                                        summary: {
                                            totalImports: analysis.imports.length,
                                            totalComponents: analysis.components.length,
                                            hasReact: analysis.hasReact,
                                            hasNextJs: analysis.hasNextJs,
                                            hasTailwind: analysis.hasTailwind,
                                            insertionPoints: analysis.insertionPoints.length
                                        }
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    }
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({error: error.message}, null, 2)
                            }
                        ],
                        isError: true
                    }
                }
            }
        )

        this.server.tool(
            'insert_existing_component',
            'Insert an existing React component into an existing page',
            {
                componentName: z.string().describe('Component name'),
                targetPage: z.string().describe('Target page name or path'),
                options: z
                    .object({
                        beforeComponentName: z
                            .string()
                            .optional()
                            .describe('Insert before Component name'),
                        afterComponentName: z
                            .string()
                            .optional()
                            .describe('Insert after Component name')
                    })
                    .optional()
            },
            async (args) => {
                try {
                    const modifiedCode = this.insertExistingComponentTool.insertComponentIntoPage(
                        args.targetPage,
                        args.componentName
                    )
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(
                                    {
                                        success: true,
                                        modifiedCode,
                                        componentType: args.componentType,
                                        options: args.options
                                    },
                                    null,
                                    2
                                )
                            }
                        ]
                    }
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({error: error.message}, null, 2)
                            }
                        ],
                        isError: true
                    }
                }
            }
        )

        this.server.tool(
            'recommend_hooks',
            'Recommends relevant hooks for a given entity (e.g., product, category).',
            {
                entity: z
                    .string()
                    .describe(
                        'The entity to get hook recommendations for (e.g., product, category, basket, customer)'
                    )
            },
            async (args) => {
                try {
                    const recommendations = this.hookRecommenderTool.getRecommendations(args.entity)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(recommendations, null, 2)
                            }
                        ]
                    }
                } catch (error) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify({error: error.message}, null, 2)
                            }
                        ],
                        isError: true
                    }
                }
            }
        )

        this.server.tool(
            'create_new_component',
            'Conversationally collect parameters and create a new React component.',
            {
                sessionId: z.string().optional().describe('Session ID for the conversational flow'),
                answer: z.string().optional().describe('User answer to the current question')
            },
            async (args) => {
                let sessionId = args.sessionId;
                if (!sessionId) {
                    sessionId = `session-interactive-${this.sessionCounter++}`;
                    this.sessions[sessionId] = { step: 1, answers: {} };
                }
                const session = this.sessions[sessionId];
                const {step, answers} = session;
                const answer = args.answer?.trim();
                const next = (question) => ({
                    content: [
                        { type: 'text', text: JSON.stringify({ sessionId, question }) }
                    ]
                });
                const done = (message) => ({
                    content: [
                        { type: 'text', text: JSON.stringify({ sessionId, message }) }
                    ]
                });
                switch (step) {
                    case 1:
                        if (answer) {
                            answers.name = answer;
                            session.step = 2;
                            const defaultDir = process.env.PWA_STOREFRONT_APP_PATH ? process.env.PWA_STOREFRONT_APP_PATH + '/components' : '/components';
                            return next(`Answer yes to use the default components directory (${defaultDir}), or no if you want to specify the full absolute path to use a different directory:`);
                        }
                        return next('What would you like to name your new React component?');
                    case 2:
                        const defaultDir = process.env.PWA_STOREFRONT_APP_PATH ? process.env.PWA_STOREFRONT_APP_PATH + '/components' : '/components';
                        if (answer) {
                            // If user says yes/y/true/1, use defaultDir
                            if (/^(yes|y|true|1)$/i.test(answer)) {
                                answers.location = defaultDir;
                            } else {
                                answers.location = answer;
                            }
                            // Always create the component here
                            const tool = new CreateNewComponentTool();
                            tool.componentData = {
                                name: answers.name,
                                location: answers.location,
                                createTestFile: false,
                                customCode: '',
                                entityType: ''
                            };
                            session.basicComponentResult = await tool.createComponent();
                            session.step = 3;
                            // Skip test file prompt, go directly to entity type
                            return next('Is this component related to a specific entity (e.g., product, category, basket, customer)? (optional, press enter to skip)');
                        }
                        return next(`Answer yes to use the default components directory (${defaultDir}), or no if you want to specify the full absolute path to use a different directory:`);
                    case 3:
                        if (answer !== undefined) {
                            answers.entityType = answer;
                        } else {
                            answers.entityType = '';
                        }
                        // Get recommended hooks for the entity
                        const {HookRecommenderTool} = await import('../utils/HookRecommenderTool.js');
                        const recommender = new HookRecommenderTool();
                        const hooks = Array.isArray(recommender.getRecommendations(answers.entityType))
                            ? recommender.getRecommendations(answers.entityType)
                            : [];
                        // Build options list
                        session.hookOptions = hooks.map(h => h.name);
                        session.hookDescriptions = hooks.map(h => h.description);
                        session.hookOptions.push('schema');
                        session.hookDescriptions.push('Use schema fields directly');
                        session.hookOptions.push('none');
                        session.hookDescriptions.push('None of the above (finish component creation now)');
                        // Build prompt
                        let prompt = 'Select data fetching details for this component:';
                        session.hookOptions.forEach((opt, idx) => {
                            prompt += `\n${idx + 1}. ${opt}`;
                            if (session.hookDescriptions[idx]) {
                                prompt += ` (${session.hookDescriptions[idx]})`;
                            }
                        });
                        prompt += '\n\nReply with the number of your choice.';
                        session.step = 4;
                        return next(prompt);
                    case 4:
                        // Interpret user selection
                        const selectedIdx = parseInt(answer, 10) - 1;
                        const selectedOption = session.hookOptions && session.hookOptions[selectedIdx];
                        if (!selectedOption) {
                            return next('Invalid selection. Please reply with a valid number from the list.');
                        }
                        if (selectedOption === 'none') {
                            session.step = 99;
                            return done((session.basicComponentResult || '') + '\nComponent creation flow complete.');
                        }
                        // Now add presentational logic if needed
                        const tool = new CreateNewComponentTool();
                        tool.componentData = {
                            name: answers.name,
                            location: answers.location,
                            createTestFile: false, // already created
                            customCode: '',
                            entityType: answers.entityType || ''
                        };
                        let result = session.basicComponentResult || '';
                        let dataModel = null;
                        if (selectedOption === 'schema') {
                            // Use schema-based presentational logic
                            const uriHref = `data://data-models/${answers.entityType}`;
                            dataModel = await this.getDataModelDocument(answers.entityType, uriHref);
                            let schemaObj = dataModel && dataModel.contents && dataModel.contents[0] && JSON.parse(dataModel.contents[0].text);
                            let presentationalResult = await tool.updateComponentToPresentational(
                                answers.entityType,
                                answers.name,
                                answers.location,
                                schemaObj && schemaObj.properties ? schemaObj.properties : {}
                            );
                            session.step = 99;
                            session.dataModel = dataModel;
                            return next(result + `\n\n${presentationalResult}\nComponent creation flow complete.`);
                        } else {
                            // Use hook-based presentational logic
                            const uriHref = `data://data-models/${answers.entityType}`;
                            dataModel = await this.getDataModelDocument(answers.entityType, uriHref);
                            let hookResult = await tool.handleHookSelection(selectedOption, answers.entityType, answers.name, answers.location, {[answers.entityType]: dataModel && dataModel.contents && dataModel.contents[0] && JSON.parse(dataModel.contents[0].text)});
                            session.step = 99;
                            session.dataModel = dataModel;
                            return next(result + `\n\n${hookResult}\nComponent creation flow complete.`);
                        }
                    case 99:
                        return done('Component creation flow complete.');
                    default:
                        session.step = 1;
                        return next('What would you like to name your new React component?');
                }
            }
        );

        this.server.resource(
            'data-model',
            new ResourceTemplate('data://data-models/{modelName}', {}),
            {
                title: 'Commerce Cloud Data Model',
                description: 'Commerce Cloud Data Model, such as Product, Category, Order, etc.'
            },
            async (uri, {modelName}) => {
                return this.getDataModelDocument(modelName, uri.href)
            }
        )

        this.server.tool(
            'get_data_model',
            'Get the schema of a data model',
            {
                modelName: z
                    .string()
                    .describe('The name of the data model (e.g., Product, Category, etc.)')
            },
            async ({modelName}) => {
                const uriHref = `data://data-models/${modelName}`
                const result = await this.getDataModelDocument(modelName, uriHref)
                return {
                    content: result.contents.map((item) => ({
                        type: 'text',
                        text: item.text
                    }))
                }
            }
        )
    }

    async getDataModelDocument(modelName, uriHref) {
        try {
            const __filename = fileURLToPath(import.meta.url)
            const __dirname = path.dirname(__filename)
            const dataDir = path.join(__dirname, '..', 'data')
            const filePath = path.join(dataDir, `${modelName}Document.json`)
            let fileContent
            try {
                fileContent = await fs.readFile(filePath, 'utf8')
            } catch (err) {
                if (err.code === 'ENOENT') {
                    fileContent = JSON.stringify({message: `No document found for ${modelName}`})
                } else {
                    throw err
                }
            }
            return {
                contents: [
                    {
                        uri: uriHref,
                        text: fileContent
                    }
                ]
            }
        } catch (error) {
            return {
                contents: [
                    {
                        uri: uriHref,
                        text: JSON.stringify({error: error.message}, null, 2)
                    }
                ]
            }
        }
    }

    async run() {
        const transport = new StdioServerTransport()
        await this.server.connect(transport)
        console.error('PWA Storefront MCP server (McpServer version) running on stdio')
    }
}

const server = new PwaStorefrontMCPServerHighLevel()
server.run().catch(console.error)
