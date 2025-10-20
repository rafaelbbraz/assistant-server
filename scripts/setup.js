#!/usr/bin/env node

/**
 * Vezlo Assistant Server Setup Wizard
 * Interactive CLI to configure database and environment
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function question(prompt) {
  return new Promise(resolve => {
    rl.question(`${colors.cyan}${prompt}${colors.reset} `, resolve);
  });
}

async function main() {
  console.clear();
  log('\n🚀 Vezlo Assistant Server Setup Wizard\n', 'bright');
  log('This wizard will help you configure your server in 4 easy steps:\n', 'blue');
  log('  1. Supabase Database Configuration');
  log('  2. OpenAI API Configuration');
  log('  3. Environment Validation');
  log('  4. Database Migration Setup\n');

  // Step 1: Supabase Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 1: Supabase Database Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const config = await setupSupabase();

  // Step 2: OpenAI Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 2: OpenAI API Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const openaiKey = await question('Enter your OpenAI API key (sk-...):');
  config.OPENAI_API_KEY = openaiKey.trim();

  const aiModel = await question('AI Model (default: gpt-4o):') || 'gpt-4o';
  config.AI_MODEL = aiModel.trim();

  const aiTemperature = await question('AI Temperature (default: 0.7):') || '0.7';
  config.AI_TEMPERATURE = aiTemperature.trim();

  const aiMaxTokens = await question('AI Max Tokens (default: 1000):') || '1000';
  config.AI_MAX_TOKENS = aiMaxTokens.trim();

  // Step 3: Save Configuration
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 3: Save Configuration', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const envPath = path.join(process.cwd(), '.env');
  log('Preparing to write environment configuration (.env)...', 'yellow');
  const createdEnv = await saveEnvFile(envPath, config);
  if (createdEnv) {
    log(`✅ Configuration saved to ${envPath}`, 'green');
  } else {
    log('ℹ️  Using existing .env (no overwrite). Review values as needed.', 'yellow');
  }

  // Step 4: Environment Validation
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 4: Environment Validation', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const validationStatus = await validateEnvironment(config);

  // Step 5: Database Migration Setup
  log('\n═══════════════════════════════════════════════════════════', 'cyan');
  log('  STEP 5: Database Migration Setup', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'cyan');

  const migrationStatus = await setupMigrations(config, validationStatus) || { migrations: 'skipped' };

  // Final Instructions / Summary
  log('\n═══════════════════════════════════════════════════════════', 'green');
  log('  🎉 Setup Complete!', 'bright');
  log('═══════════════════════════════════════════════════════════\n', 'green');

  // Summary
  log('Summary:', 'bright');
  log(`  Supabase API: ${validationStatus.supabaseApi === 'success' ? colors.green + 'OK' : colors.red + 'FAILED'}${colors.reset}`);
  log(`  Database: ${validationStatus.database === 'success' ? colors.green + 'OK' : colors.red + (validationStatus.database === 'skipped' ? 'SKIPPED' : 'FAILED')}${colors.reset}`);
  log(`  Migrations: ${migrationStatus.migrations === 'success' ? colors.green + 'OK' : migrationStatus.migrations === 'skipped' ? colors.yellow + 'SKIPPED' : colors.red + 'FAILED'}${colors.reset}`);

  log('\nNext steps:');
  log('  1. Review your .env file');
  log('  2. Start the server: ' + colors.bright + 'vezlo-server' + colors.reset);
  log('  3. Visit: ' + colors.bright + 'http://localhost:3000/health' + colors.reset);
  log('  4. API docs: ' + colors.bright + 'http://localhost:3000/docs' + colors.reset);
  log('  5. Test API: ' + colors.bright + 'curl http://localhost:3000/health' + colors.reset + '\n');

  rl.close();
  // Ensure graceful exit even if any handles remain
  setImmediate(() => process.exit(0));
}

async function setupSupabase() {
  log('\n📦 Supabase Configuration\n', 'blue');
  log('You can find these values in your Supabase Dashboard:', 'yellow');
  log('  • API keys & URL: Settings > API > Project URL & API Keys', 'yellow');
  log('  • Database params: Settings > Database > Connection info', 'yellow');
  log('  • Optional pooling: Connect > Connection Pooling > Session Pooler > View parameters\n', 'yellow');

  // Get Supabase URL and extract project ID for defaults
  const supabaseUrl = await question('Supabase Project URL (https://xxx.supabase.co):');
  const projectId = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
  
  if (!projectId) {
    log('\n❌ Invalid Supabase URL format. Please use: https://your-project.supabase.co', 'red');
    throw new Error('Invalid Supabase URL');
  }

  const supabaseServiceKey = await question('Supabase Service Role Key:');
  const supabaseAnonKey = await question('Supabase Anon Key (optional, press Enter to skip):');

  // Show defaults and ask for each database parameter
  log('\n📊 Database Connection Details:', 'blue');
  
  const dbHost = await question(`Database Host (default: db.${projectId}.supabase.co):`) || `db.${projectId}.supabase.co`;
  const dbPort = await question('Database Port (default: 5432):') || '5432';
  const dbName = await question('Database Name (default: postgres):') || 'postgres';
  const dbUser = await question(`Database User (default: postgres.${projectId}):`) || `postgres.${projectId}`;
  const dbPassword = await question('Database Password (from Settings > Database):');

  // Validate Supabase connection (same as validate script)
  log('\n🔄 Validating Supabase connection...', 'yellow');
  
  try {
    const client = createClient(supabaseUrl.trim(), supabaseServiceKey.trim());
    const { error } = await client.from('vezlo_conversations').select('count').limit(0);

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    log('✅ Supabase connection successful!\n', 'green');
  } catch (err) {
    log(`❌ Supabase connection failed: ${err.message}`, 'red');
    throw new Error('Supabase connection validation failed');
  }

  // Validate database connection (same as validate script)
  log('🔄 Validating database connection...', 'yellow');
  
  let client;
  try {
    const { Client } = require('pg');
    
    client = new Client({
      host: dbHost.trim(),
      port: parseInt(dbPort.trim()),
      database: dbName.trim(),
      user: dbUser.trim(),
      password: dbPassword.trim(),
      ssl: { rejectUnauthorized: false }
    });

    // Handle connection errors quietly for normal shutdowns
    client.on('error', (err) => {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg && (msg.includes('client_termination') || msg.includes(':shutdown'))) {
        return; // ignore normal termination noise
      }
      console.error('Database connection error:', msg);
    });

    await client.connect();
    log('✅ Database connection successful!\n', 'green');
    await client.end();
  } catch (err) {
    log(`❌ Database connection failed: ${err.message}`, 'red');
    throw new Error('Database connection validation failed');
  }

  return {
    SUPABASE_URL: supabaseUrl.trim(),
    SUPABASE_ANON_KEY: supabaseAnonKey.trim() || '',
    SUPABASE_SERVICE_KEY: supabaseServiceKey.trim(),
    SUPABASE_DB_HOST: dbHost.trim(),
    SUPABASE_DB_PORT: dbPort.trim(),
    SUPABASE_DB_NAME: dbName.trim(),
    SUPABASE_DB_USER: dbUser.trim(),
    SUPABASE_DB_PASSWORD: dbPassword.trim(),
    PORT: '3000',
    NODE_ENV: 'development',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173'
  };
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  log('\n\n⚠️  Setup cancelled by user', 'yellow');
  rl.close();
  process.exit(0);
});

// Run the wizard
main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});

async function saveEnvFile(envPath, config) {
  // Don't overwrite existing .env
  if (fs.existsSync(envPath)) {
    log('\n⚠️  .env already exists. Skipping overwrite. Please review values manually.', 'yellow');
    return false;
  }
  const envContent = `# Vezlo Assistant Server Configuration
# Generated by setup wizard on ${new Date().toISOString()}

# Server Configuration
PORT=${config.PORT || '3000'}
NODE_ENV=${config.NODE_ENV || 'development'}
LOG_LEVEL=info

# CORS Configuration
CORS_ORIGINS=${config.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'}

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Supabase Configuration
${config.SUPABASE_URL ? `SUPABASE_URL=${config.SUPABASE_URL}` : '# SUPABASE_URL=https://your-project.supabase.co'}
${config.SUPABASE_ANON_KEY ? `SUPABASE_ANON_KEY=${config.SUPABASE_ANON_KEY}` : '# SUPABASE_ANON_KEY=your-anon-key'}
${config.SUPABASE_SERVICE_KEY ? `SUPABASE_SERVICE_KEY=${config.SUPABASE_SERVICE_KEY}` : '# SUPABASE_SERVICE_KEY=your-service-role-key'}

# Database Configuration
SUPABASE_DB_HOST=${config.SUPABASE_DB_HOST || 'localhost'}
SUPABASE_DB_PORT=${config.SUPABASE_DB_PORT || '5432'}
SUPABASE_DB_NAME=${config.SUPABASE_DB_NAME || 'postgres'}
SUPABASE_DB_USER=${config.SUPABASE_DB_USER || 'postgres'}
SUPABASE_DB_PASSWORD=${config.SUPABASE_DB_PASSWORD || ''}

# OpenAI Configuration
OPENAI_API_KEY=${config.OPENAI_API_KEY || 'sk-your-openai-api-key'}
AI_MODEL=${config.AI_MODEL || 'gpt-4o'}
AI_TEMPERATURE=${config.AI_TEMPERATURE || '0.7'}
AI_MAX_TOKENS=${config.AI_MAX_TOKENS || '1000'}

# Organization Settings
ORGANIZATION_NAME=Vezlo
ASSISTANT_NAME=Vezlo Assistant

# Knowledge Base
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  return true;
}

async function validateEnvironment(config) {
  log('🔄 Validating environment configuration...', 'yellow');

  // Test Supabase connection (same as validate script)
  try {
    const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
    const { error } = await client.from('vezlo_conversations').select('count').limit(0);
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    log('✅ Supabase API connection validated', 'green');
  } catch (err) {
    log(`❌ Supabase API validation failed: ${err.message}`, 'red');
    // non-blocking
    return { supabaseApi: 'failed', database: 'skipped' };
  }

  // Test database connection (same as validate script)
  let client;
  try {
    const { Client } = require('pg');
    
    client = new Client({
      host: config.SUPABASE_DB_HOST,
      port: parseInt(config.SUPABASE_DB_PORT),
      database: config.SUPABASE_DB_NAME,
      user: config.SUPABASE_DB_USER,
      password: config.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    // Handle connection errors quietly for normal shutdowns
    client.on('error', (err) => {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg && (msg.includes('client_termination') || msg.includes(':shutdown'))) {
        return; // ignore normal termination noise
      }
      console.error('Database connection error:', msg);
    });

    await client.connect();
    log('✅ Database connection validated', 'green');
    await client.end();
  } catch (err) {
    log(`❌ Database validation failed: ${err.message}`, 'red');
    return { supabaseApi: 'success', database: 'failed' };
  }

  log('✅ Environment validation complete!\n', 'green');
  return { supabaseApi: 'success', database: 'success' };
}

async function setupMigrations(config, validationStatus) {
  log('🔄 Checking migration status...', 'yellow');

  if (validationStatus.database !== 'success') {
    log('⚠️  Skipping migrations because database validation failed.', 'yellow');
    return { migrations: 'skipped' };
  }

  try {
    const { Client } = require('pg');
    const client = new Client({
      host: config.SUPABASE_DB_HOST,
      port: parseInt(config.SUPABASE_DB_PORT),
      database: config.SUPABASE_DB_NAME,
      user: config.SUPABASE_DB_USER,
      password: config.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // Check if migrations table exists
    const migrationTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'knex_migrations'
      );
    `);

    if (!migrationTableExists.rows[0].exists) {
      log('📋 No migrations table found. Database needs initial setup.', 'blue');
      
      const runMigrations = await question('Run initial database migrations now? (y/n):');
      
      if (runMigrations.toLowerCase() === 'y') {
        log('🔄 Running migrations...', 'yellow');
        
        // Set environment variables for migration
        process.env.SUPABASE_DB_HOST = config.SUPABASE_DB_HOST;
        process.env.SUPABASE_DB_PORT = config.SUPABASE_DB_PORT;
        process.env.SUPABASE_DB_NAME = config.SUPABASE_DB_NAME;
        process.env.SUPABASE_DB_USER = config.SUPABASE_DB_USER;
        process.env.SUPABASE_DB_PASSWORD = config.SUPABASE_DB_PASSWORD;
        
        const { execSync } = require('child_process');
        execSync('npm run migrate:latest', { stdio: 'inherit' });
        
        log('✅ Migrations completed successfully!', 'green');
        return { migrations: 'success' };
      } else {
        log('\n⚠️  Migrations skipped. You can run them later using:', 'yellow');
        log('   npm run migrate:latest', 'cyan');
        log('   Or via API: GET /api/migrate?key=your-migration-secret\n', 'cyan');
        return { migrations: 'skipped' };
      }
    } else {
      // Check migration status
      const migrationStatus = await client.query(`
        SELECT COUNT(*) as count FROM knex_migrations;
      `);
      
      log(`📊 Found ${migrationStatus.rows[0].count} completed migrations`, 'blue');
      
      const runPending = await question('Check for pending migrations? (y/n):');
      
      if (runPending.toLowerCase() === 'y') {
        log('🔄 Checking for pending migrations...', 'yellow');
        
        const { execSync } = require('child_process');
        execSync('npm run migrate:latest', { stdio: 'inherit' });
        
        log('✅ Migration check completed!', 'green');
        return { migrations: 'success' };
      }
    }

    await client.end();
  } catch (err) {
    log(`❌ Migration setup failed: ${err.message}`, 'red');
    log('\nYou can run migrations manually later:', 'yellow');
    log('   npm run migrate:latest', 'cyan');
    log('   Or via API: GET /api/migrate?key=your-migration-secret\n', 'cyan');
    return { migrations: 'failed' };
  }
}

// Handle errors and cleanup
process.on('SIGINT', () => {
  log('\n\n⚠️  Setup cancelled by user', 'yellow');
  rl.close();
  process.exit(0);
});

// Run the wizard
main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, 'red');
  rl.close();
  process.exit(1);
});
