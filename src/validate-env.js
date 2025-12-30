/**
 * Environment Validation Script
 * Validates all configuration on startup to catch errors early
 * Run: npm run validate or automatically via npm start (prestart hook)
 */

import 'dotenv/config';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

class EnvValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Require a variable to be present
   */
  require(name, description) {
    if (!process.env[name]) {
      this.errors.push({
        name,
        message: `Missing required variable: ${name}`,
        description,
        suggestion: `Add ${name}=your_value to .env file`,
      });
    }
    return this;
  }

  /**
   * Recommend a variable (warn if missing)
   */
  recommend(name, description, defaultValue) {
    if (!process.env[name]) {
      this.warnings.push({
        name,
        message: `Missing recommended variable: ${name}`,
        description,
        default: defaultValue,
      });
    }
    return this;
  }

  /**
   * Validate a variable is a number
   */
  validateNumber(name, min = null, max = null) {
    const value = process.env[name];
    if (!value) return this;

    const num = parseInt(value, 10);
    if (isNaN(num)) {
      this.errors.push({
        name,
        message: `${name} must be a number, got: "${value}"`,
      });
      return this;
    }

    if (min !== null && num < min) {
      this.errors.push({
        name,
        message: `${name} must be >= ${min}, got: ${num}`,
      });
    }

    if (max !== null && num > max) {
      this.errors.push({
        name,
        message: `${name} must be <= ${max}, got: ${num}`,
      });
    }

    return this;
  }

  /**
   * Validate a variable is a valid URL
   */
  validateUrl(name) {
    const value = process.env[name];
    if (!value) return this;

    try {
      new URL(value);
    } catch {
      this.errors.push({
        name,
        message: `${name} must be a valid URL, got: "${value}"`,
        suggestion: 'Example: http://localhost:8000/api/webhook',
      });
    }

    return this;
  }

  /**
   * Validate a variable is one of allowed values
   */
  validateEnum(name, allowedValues) {
    const value = process.env[name];
    if (!value) return this;

    if (!allowedValues.includes(value)) {
      this.errors.push({
        name,
        message: `${name} must be one of: ${allowedValues.join(', ')}`,
        got: value,
      });
    }

    return this;
  }

  /**
   * Custom validation
   */
  validate(name, validator, errorMessage) {
    const value = process.env[name];
    if (!value) return this;

    if (!validator(value)) {
      this.errors.push({
        name,
        message: errorMessage,
        got: value,
      });
    }

    return this;
  }

  /**
   * Print validation results
   */
  report() {
    console.log('\n' + '='.repeat(60));
    console.log('WA2Bridge - Environment Validation');
    console.log('='.repeat(60) + '\n');

    // Show errors
    if (this.errors.length > 0) {
      console.log(`${COLORS.red}ERRORS (${this.errors.length}):${COLORS.reset}\n`);
      for (const error of this.errors) {
        console.log(`  ${COLORS.red}✗${COLORS.reset} ${error.name}`);
        console.log(`    ${error.message}`);
        if (error.description) {
          console.log(`    ${COLORS.blue}Description:${COLORS.reset} ${error.description}`);
        }
        if (error.suggestion) {
          console.log(`    ${COLORS.green}Suggestion:${COLORS.reset} ${error.suggestion}`);
        }
        console.log('');
      }
    }

    // Show warnings
    if (this.warnings.length > 0) {
      console.log(`${COLORS.yellow}WARNINGS (${this.warnings.length}):${COLORS.reset}\n`);
      for (const warning of this.warnings) {
        console.log(`  ${COLORS.yellow}⚠${COLORS.reset} ${warning.name}`);
        console.log(`    ${warning.message}`);
        if (warning.description) {
          console.log(`    ${COLORS.blue}Description:${COLORS.reset} ${warning.description}`);
        }
        if (warning.default) {
          console.log(`    ${COLORS.green}Using default:${COLORS.reset} ${warning.default}`);
        }
        console.log('');
      }
    }

    // Summary
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(`${COLORS.green}✓ All environment variables are valid!${COLORS.reset}\n`);
    } else if (this.errors.length === 0) {
      console.log(`${COLORS.green}✓ Configuration valid with ${this.warnings.length} warning(s)${COLORS.reset}\n`);
    }

    console.log('='.repeat(60) + '\n');

    return this;
  }

  /**
   * Exit if there are errors
   */
  exitOnError() {
    if (this.errors.length > 0) {
      console.log(`${COLORS.red}Exiting due to configuration errors.${COLORS.reset}`);
      console.log(`${COLORS.blue}Please fix the errors above and try again.${COLORS.reset}\n`);
      process.exit(1);
    }
    return this;
  }

  /**
   * Get validation results
   */
  getResults() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

// Run validation
const validator = new EnvValidator();

// Core settings
validator
  .recommend('PORT', 'HTTP server port', '3000')
  .recommend('HOST', 'HTTP server host', '0.0.0.0')
  .validateNumber('PORT', 1, 65535);

// Authentication
validator
  .recommend('API_SECRET', 'API authentication token', 'none (no auth)')
  .validate('API_SECRET', (v) => v.length >= 8, 'API_SECRET should be at least 8 characters for security');

// Webhook
validator
  .recommend('WEBHOOK_URL', 'Laravel webhook URL for incoming messages', 'none (messages not forwarded)')
  .validateUrl('WEBHOOK_URL');

// Anti-ban settings
validator
  .recommend('ACCOUNT_AGE_WEEKS', 'WhatsApp account age in weeks (affects rate limits)', '4')
  .validateNumber('ACCOUNT_AGE_WEEKS', 1, 52)
  .recommend('ACTIVE_HOURS_START', 'Bot active hours start (24h format)', '7')
  .validateNumber('ACTIVE_HOURS_START', 0, 23)
  .recommend('ACTIVE_HOURS_END', 'Bot active hours end (24h format)', '23')
  .validateNumber('ACTIVE_HOURS_END', 0, 24);

// Message settings
validator
  .recommend('MESSAGE_DELAY_MS', 'Base delay between messages (ms)', '1500')
  .validateNumber('MESSAGE_DELAY_MS', 500, 10000)
  .recommend('TYPING_DELAY_MS', 'Base typing indicator duration (ms)', '500')
  .validateNumber('TYPING_DELAY_MS', 100, 5000);

// Logging
validator
  .recommend('LOG_LEVEL', 'Logging verbosity', 'info')
  .validateEnum('LOG_LEVEL', ['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

// Validate account age vs active hours logic
const activeStart = parseInt(process.env.ACTIVE_HOURS_START || '7', 10);
const activeEnd = parseInt(process.env.ACTIVE_HOURS_END || '23', 10);
if (activeEnd <= activeStart) {
  validator.warnings.push({
    name: 'ACTIVE_HOURS',
    message: `ACTIVE_HOURS_END (${activeEnd}) should be greater than ACTIVE_HOURS_START (${activeStart})`,
    description: 'Bot will have limited online hours',
  });
}

// Report and exit on error
validator.report().exitOnError();

console.log('Environment validation passed. Starting WA2Bridge...\n');

export { EnvValidator };
