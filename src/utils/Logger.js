class Logger {
    constructor(level = 'info') {
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.currentLevel = this.levels[level] || this.levels.info;
    }

    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.currentLevel = this.levels[level];
        }
    }

    shouldLog(level) {
        return this.levels[level] >= this.currentLevel;
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const levelStr = level.toUpperCase().padEnd(5);
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ') : '';
        
        return `[${timestamp}] ${levelStr} ${message}${formattedArgs}`;
    }

    debug(message, ...args) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, ...args));
        }
    }

    info(message, ...args) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, ...args));
        }
    }

    warn(message, ...args) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, ...args));
        }
    }

    error(message, ...args) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, ...args));
        }
    }

    success(message, ...args) {
        if (this.shouldLog('info')) {
            console.log('✅ ' + this.formatMessage('info', message, ...args));
        }
    }

    failure(message, ...args) {
        if (this.shouldLog('error')) {
            console.error('❌ ' + this.formatMessage('error', message, ...args));
        }
    }
}

module.exports = Logger;