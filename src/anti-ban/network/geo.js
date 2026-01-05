/**
 * GeoIP Matcher
 *
 * Validates that IP location matches phone country.
 * Mismatch can trigger suspicion.
 */

export class GeoIPMatcher {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.phoneCountry = null;
    this.currentIPCountry = null;
    this.mismatchWarnings = 0;

    this.phonePrefixes = {
      '62': 'ID',
      '1': 'US',
      '44': 'GB',
      '60': 'MY',
      '65': 'SG',
      '61': 'AU',
      '81': 'JP',
      '82': 'KR',
      '86': 'CN',
      '91': 'IN',
      '49': 'DE',
      '33': 'FR',
    };
  }

  setPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');

    for (const [prefix, country] of Object.entries(this.phonePrefixes)) {
      if (cleaned.startsWith(prefix)) {
        this.phoneCountry = country;
        return country;
      }
    }

    return null;
  }

  async checkIPCountry() {
    try {
      const response = await fetch('https://ipapi.co/json/', {
        timeout: 5000,
      });

      if (response.ok) {
        const data = await response.json();
        this.currentIPCountry = data.country_code;
        return this.validateMatch();
      }
    } catch (err) {
      return { matched: true, warning: false };
    }

    return { matched: true, warning: false };
  }

  validateMatch() {
    if (!this.phoneCountry || !this.currentIPCountry) {
      return { matched: true, warning: false, reason: 'Unable to determine' };
    }

    if (this.phoneCountry === this.currentIPCountry) {
      this.mismatchWarnings = 0;
      return { matched: true, warning: false };
    }

    this.mismatchWarnings++;

    return {
      matched: false,
      warning: true,
      phoneCountry: this.phoneCountry,
      ipCountry: this.currentIPCountry,
      mismatchCount: this.mismatchWarnings,
      recommendation: 'IP country does not match phone country. Consider using VPN to match location.',
    };
  }

  getStatus() {
    return {
      phoneCountry: this.phoneCountry,
      currentIPCountry: this.currentIPCountry,
      matched: this.phoneCountry === this.currentIPCountry,
      mismatchWarnings: this.mismatchWarnings,
    };
  }
}

export default GeoIPMatcher;
