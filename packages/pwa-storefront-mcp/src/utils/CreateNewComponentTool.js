/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import fs from 'fs/promises'
import path from 'path'
import {HookRecommenderTool} from './HookRecommenderTool.js'

export const getCopyrightHeader = () => {
    const year = new Date().getFullYear()
    return `/*
 * Copyright (c) ${year}, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */`
}

// Utility to infer entity from component name
function inferEntityFromComponentName(componentName) {
    const name = componentName.toLowerCase()
    if (name.includes('customer')) return 'customer'
    if (name.includes('product')) return 'product'
    if (name.includes('basket')) return 'basket'
    if (name.includes('category')) return 'category'
    return null
}

export class CreateNewComponentTool {
    constructor() {
        this.currentStep = 0
        this.componentData = {
            name: null,
            location: null,
            createTestFile: null,
            customCode: null,
            entityType: null
        }
    }

    /**
     * Creates the component based on all collected data
     * @returns {Promise<string>} The result of component creation
     */
    async createComponent() {
        const messages = []

        // Use the provided absolute path directly if available
        const location = this.componentData.location
        const componentMessage = await this.createComponentFile(
            this.componentData.name,
            location,
            this.componentData.customCode
        )
        messages.push(componentMessage)

        // Create test file if requested
        if (this.componentData.createTestFile) {
            const testMessage = await this.createTestFile(this.componentData.name, location)
            messages.push(testMessage)
        }

        // Handle entity type information
        if (this.componentData.entityType) {
            messages.push(
                `\nℹ️ Entity type '${this.componentData.entityType}' ${
                    inferEntityFromComponentName(this.componentData.name)
                        ? 'was inferred'
                        : 'was specified'
                } for component '${this.componentData.name}'.`
            )
        } else {
            messages.push(
                `\nℹ️ No entity type was specified or could be inferred for component '${this.componentData.name}'.`
            )
        }

        // Recommend hooks if entity is available
        if (this.componentData.entityType) {
            const recommender = new HookRecommenderTool()
            const recommendations = recommender.getRecommendations(this.componentData.entityType)
            if (Array.isArray(recommendations)) {
                messages.push(
                    `\n🔗 Recommended hooks for entity '${this.componentData.entityType}':`
                )
                recommendations.forEach((hook) => {
                    messages.push(`- ${hook.name}: ${hook.description} (from ${hook.package})`)
                })
            } else if (recommendations.error) {
                messages.push(`\n${recommendations.error}`)
            }
        } else {
            messages.push('\nℹ️ No entity provided or inferred for hook recommendations.')
        }

        // Always append lint reminder
        messages.push(
            "\n💡 After creating or modifying a component, run 'npm run lint -- --fix' to automatically fix formatting and linter issues."
        )

        // Reset for next use
        this.reset()

        return messages.join('\n')
    }

    /**
     * Resets the tool state for the next component creation
     */
    reset() {
        this.currentStep = 0
        this.componentData = {
            name: null,
            location: null,
            createTestFile: null,
            customCode: null,
            entityType: null
        }
    }

    /**
     * Creates a new React component file.
     * @param {string} componentName - Name for the new component.
     * @param {string} projectDir - The absolute path to the project directory for the new component.
     * @param {string} [componentCode] - Code of the component to create. If not provided, a default skeleton will be used.
     */
    async createComponentFile(componentName, projectDir, componentCode) {
        const componentDir = path.join(projectDir, componentName)
        try {
            await fs.mkdir(componentDir, {recursive: true})
            // Create component file
            const componentFilePath = path.join(componentDir, 'index.jsx')
            const codeToWrite =
                !componentCode || componentCode === 'default skeleton'
                    ? `${getCopyrightHeader()}
import React from 'react';

const ${componentName} = () => {
  return (
    <div>${componentName} component</div>
  );
};

export default ${componentName};
`
                    : componentCode
            await fs.writeFile(componentFilePath, codeToWrite, 'utf-8')
            return `✅ Created ${componentFilePath}`
        } catch (err) {
            console.error('Error during file creation:', err)
            return `❌ Error creating component file at ${componentDir}: ${err.message}`
        }
    }

    /**
     * Creates a test file for an existing component.
     * @param {string} componentName - Name of the component to create a test file for.
     * @param {string} projectDir - The absolute path to the project directory where the component exists.
     */
    async createTestFile(componentName, projectDir) {
        const componentDir = path.join(projectDir, componentName)
        try {
            // Create test file
            const testFilePath = path.join(componentDir, 'index.test.jsx')
            const testCode = `${getCopyrightHeader()}
import React from 'react'
import {screen} from '@testing-library/react'
import {renderWithProviders} from '@salesforce/retail-react-app/app/utils/test-utils'
import ${componentName} from './index'

describe('${componentName}', () => {
    test('renders correctly', () => {
        renderWithProviders(<${componentName} />)
        expect(screen.getByText('${componentName} component')).toBeInTheDocument()
    })
})
`
            await fs.writeFile(testFilePath, testCode, 'utf-8')
            return `✅ Created ${testFilePath}`
        } catch (err) {
            console.error('Error during test file creation:', err)
            return `❌ Error creating test file at ${componentDir}: ${err.message}`
        }
    }

    /**
     * Updates the component file to be a presentational component for the given data model.
     * @param {string} entityType - The entity type (e.g., 'product').
     * @param {string} componentName - The component name.
     * @param {string} location - The absolute path to the component's parent directory.
     * @param {object} dataModel - The data model schema (properties object).
     */
    async updateComponentToPresentational(entityType, componentName, location, dataModel) {
        const componentDir = path.join(location, componentName)
        await fs.mkdir(componentDir, {recursive: true})
        const componentFilePath = path.join(componentDir, 'index.jsx')
        // Generate JSX for all fields
        const fields = Object.keys(dataModel)
        const propName = entityType
        const jsxFields = fields
            .map((field) =>
                `        <div>${field}: {{{propName}.${field}?.toString?.() ?? ''}}</div>`.replace(
                    /\{propName/g,
                    propName
                )
            )
            .join('\n')
        const code = `${getCopyrightHeader()}
import React from 'react';

const ${componentName} = ({{ ${propName} }}) => (
    <div>
${jsxFields}
    </div>
);

export default ${componentName};
`
        await fs.writeFile(componentFilePath, code, 'utf-8')
        return `✅ Updated ${componentFilePath} to presentational component for ${entityType}`
    }

    /**
     * Handles developer's hook selection and updates the component accordingly.
     * @param {string} selectedHook - The hook selected by the developer (e.g., 'useProduct').
     * @param {string} entityType - The entity type (e.g., 'product').
     * @param {string} componentName - The component name.
     * @param {string} location - The absolute path to the component's parent directory.
     * @param {object} dataModels - An object mapping entity types to their data model schemas.
     */
    async handleHookSelection(selectedHook, entityType, componentName, location, dataModels) {
        // For now, only support 'useProduct' and 'product' entity
        if (selectedHook === 'useProduct' && entityType === 'product' && dataModels.product) {
            return await this.updateComponentToPresentational(
                'product',
                componentName,
                location,
                dataModels.product.properties
            )
        }
        // Add more hook/entity support as needed
        return 'Selected hook/entity not supported for presentational generation.'
    }
}
