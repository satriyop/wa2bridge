/**
 * Weekend Patterns
 *
 * Adjusts messaging behavior for weekends and holidays.
 * Humans naturally message less on weekends/holidays.
 */

/**
 * Handles weekend and holiday behavior adjustments
 */
export class WeekendPatterns {
  constructor(options = {}) {
    // Weekend days (0 = Sunday, 6 = Saturday)
    this.weekendDays = options.weekendDays || [0, 6];

    // Holiday dates (MM-DD format)
    this.holidays = options.holidays || [
      '01-01', // New Year
      '12-25', // Christmas
      '12-31', // New Year's Eve
    ];

    // Adjustments
    this.weekendMultiplier = options.weekendMultiplier || 0.6;   // 60% activity on weekends
    this.holidayMultiplier = options.holidayMultiplier || 0.4;   // 40% activity on holidays
    this.weekendDelayBonus = options.weekendDelayBonus || 1.5;   // 50% longer delays
  }

  /**
   * Check if today is a weekend
   */
  isWeekend() {
    const day = new Date().getDay();
    return this.weekendDays.includes(day);
  }

  /**
   * Check if today is a holiday
   */
  isHoliday() {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return this.holidays.includes(mmdd);
  }

  /**
   * Get rate multiplier for today
   */
  getRateMultiplier() {
    if (this.isHoliday()) return this.holidayMultiplier;
    if (this.isWeekend()) return this.weekendMultiplier;
    return 1.0;
  }

  /**
   * Get delay multiplier for today
   */
  getDelayMultiplier() {
    if (this.isHoliday()) return 2.0;  // Double delays on holidays
    if (this.isWeekend()) return this.weekendDelayBonus;
    return 1.0;
  }

  /**
   * Adjust a rate limit based on day
   */
  adjustLimit(baseLimit) {
    return Math.max(1, Math.floor(baseLimit * this.getRateMultiplier()));
  }

  /**
   * Adjust a delay based on day
   */
  adjustDelay(baseDelay) {
    return Math.floor(baseDelay * this.getDelayMultiplier());
  }

  getStatus() {
    return {
      isWeekend: this.isWeekend(),
      isHoliday: this.isHoliday(),
      rateMultiplier: (this.getRateMultiplier() * 100).toFixed(0) + '%',
      delayMultiplier: this.getDelayMultiplier().toFixed(1) + 'x',
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
    };
  }
}

export default WeekendPatterns;
