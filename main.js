#!/usr/bin/env node

const { program } = require('commander');
const { Client } = require('@notionhq/client');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

dotenv.config();

const configPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.fast-notion'
);
let notion;
let currentDatabase;

function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function loadConfig() {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return {};
}

function initNotionClient() {
    const config = loadConfig();
    if (config.notionToken) {
        notion = new Client({ auth: config.notionToken });
        return true;
    }
    return false;
}

// authorization
program
    .command('auth')
    .description('Authorize Notion')
    .action(async () => {
        console.log('To authorize Fast-Notion, please follow these steps:');
        console.log('1. Go to https://www.notion.so/my-integrations');
        console.log('2. Click on "New integration"');
        console.log('3. Give your integration a name (e.g., "Curate")');
        console.log(
            '4. Select the associated workspace where you want to use this integration'
        );

        console.log('5. Click "Save" to create the integration');
        console.log(
            '6. On the next page, find and copy the "Internal Integration Secret". You may need to click on "Show" to see it.'
        );
        console.log('7. Paste the secret on the terminal when prompted');

        try {
            const open = await import('open');
            await open.default('https://www.notion.so/my-integrations');
        } catch (error) {
            console.error(
                'Failed to open URL automatically. Please open it manually in your browser.'
            );
        }

        const token = await promptForInput(
            'Enter your Notion Internal Integration Secret: '
        );
        const config = loadConfig();
        config.notionToken = token;
        saveConfig(config);
        console.log('Authorization successful!');
        console.log(
            'Important: Remember to connect your page with the integration in Notion.'
        );
    });

// create database
program
    .command('set-db <dbname>')
    .description('Set the current database or create a new one')
    .action(async (dbname) => {
        if (!initNotionClient()) {
            console.log('Please run "noti auth" first to authorize.');
            return;
        }

        try {
            let response = await notion.search({
                query: dbname,
                filter: { property: 'object', value: 'database' },
            });

            console.log(response);

            let databaseId;

            if (response.results.length > 0) {
                databaseId = response.results[0].id;
                console.log(`Connected to existing database: ${dbname}`);
            } else {
                console.log(
                    `Database "${dbname}" not found. Attempting to create a new one...`
                );

                // search for a page where we can create a database
                response = await notion.search({
                    filter: { property: 'object', value: 'page' },
                });

                if (response.results.length > 0) {
                    const parentPage = response.results[0];
                    console.log(
                        `Creating new database in page: ${parentPage.properties.title.title[0].plain_text}`
                    );

                    const newDatabase = await notion.databases.create({
                        parent: { type: 'page_id', page_id: parentPage.id },
                        title: [{ type: 'text', text: { content: dbname } }],
                        properties: {
                            Title: { title: {} },
                            URL: { url: {} },
                            Tags: { multi_select: {} },
                        },
                    });

                    databaseId = newDatabase.id;
                    console.log(`Created new database: ${dbname}`);
                } else {
                    console.log('No parent page found to create the database.');
                    console.log('Please follow these steps:');
                    console.log('1. Go to your Notion workspace');
                    console.log('2. Create a new page');
                    console.log(
                        '3. Go to the page settings. 3 dot at top right corner.'
                    );
                    console.log(
                        '4. Under the Connections section, select - Connnect to.'
                    );
                    console.log('5. Run this command again');
                    return;
                }
            }

            const config = loadConfig();
            config.currentDatabase = databaseId;
            saveConfig(config);

            console.log(`Current database set to: ${dbname}`);
        } catch (error) {
            console.error('Error setting/creating database:', error.message);
            if (error.body) {
                console.error('Error details:', error.body);
            }
        }
    });

program.parse(process.argv);

function promptForInput(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}