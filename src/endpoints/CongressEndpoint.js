const axios = require('axios');
const BaseEndpoint = require('../core/BaseEndpoint');

class CongressEndpoint extends BaseEndpoint {
    constructor(config, dataManager) {
        super('congress', config, dataManager);
        this.apiConfig = config.getAPIConfig('congress');
        this.requestTimeout = 10000;
        this.billTypes = ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'];
        
        // Set retention period to 7 days for Congress items
        this.dataManager.setRetentionPeriod(this.name, 7 * 24 * 60 * 60);
        
        if (!this.apiConfig.token) {
            this.logError('Congress API token not configured');
            this.setEnabled(false);
        }
    }

    async initialize() {
        if (!this.apiConfig.token) {
            this.logError('Cannot initialize Congress endpoint - missing API token');
            return;
        }

        this.logInfo('Initializing Congress endpoint...');
        this.logInfo(`Configured for Congress ${this.apiConfig.currentCongress}`);
    }

    async fetchUpdate() {
        if (!this.isEnabled || !this.apiConfig.token) {
            return null;
        }

        this.logDebug('Fetching Congress update...');
        
        // Try to get recent bill updates first
        const billUpdate = await this.getRecentBillUpdate();
        if (billUpdate) {
            this.logInfo(`Found bill update: ${billUpdate.title.substring(0, 50)}...`);
            return this.formatNewsItem({
                title: billUpdate.title,
                url: billUpdate.url,
                details: billUpdate.details
            });
        }

        // Then try to get recent votes
        const voteUpdate = await this.getRecentVote();
        if (voteUpdate) {
            this.logInfo(`Found vote update: ${voteUpdate.title.substring(0, 50)}...`);
            return this.formatNewsItem({
                title: voteUpdate.title,
                url: voteUpdate.url,
                details: voteUpdate.details
            });
        }

        this.logDebug('No new Congress updates found');
        return null;
    }

    async getRecentBillUpdate() {
        for (const billType of this.billTypes) {
            try {
                const response = await axios.get(
                    `${this.apiConfig.baseUrl}/bill/${this.apiConfig.currentCongress}/${billType}`,
                    {
                        headers: { 'X-API-Key': this.apiConfig.token },
                        params: {
                            format: 'json',
                            limit: 20,
                            sort: 'updateDateIncludingText:desc'
                        },
                        timeout: this.requestTimeout
                    }
                );

                const bills = response.data?.bills || [];
                
                for (const bill of bills) {
                    const billId = `${bill.congress}-${bill.type}-${bill.number}`;
                    const updateDate = new Date(bill.updateDateIncludingText);
                    const hoursSinceUpdate = (Date.now() - updateDate.getTime()) / (1000 * 60 * 60);
                    
                    // Only consider bills updated in the last 24 hours
                    if (hoursSinceUpdate > 24) continue;
                    
                    if (this.hasSeenItem(billId)) continue;

                    this.markItemAsSeen(billId);
                    
                    return {
                        title: `📋 BILL UPDATE: ${bill.title}`,
                        url: `https://congress.gov/bill/${bill.congress}th-congress/${bill.type}/${bill.number}`,
                        details: `${bill.type.toUpperCase()} ${bill.number} - Updated: ${this.formatDate(bill.updateDateIncludingText)}`
                    };
                }
            } catch (error) {
                this.logError(`Error fetching ${billType} bills`, error);
            }
        }
        return null;
    }

    async getRecentVote() {
        try {
            // Try House votes first (new beta endpoint)
            const houseResponse = await axios.get(
                `${this.apiConfig.baseUrl}/house-vote/${this.apiConfig.currentCongress}`,
                {
                    headers: { 'X-API-Key': this.apiConfig.token },
                    params: {
                        format: 'json',
                        limit: 10,
                        sort: 'date:desc'
                    },
                    timeout: this.requestTimeout
                }
            );

            const houseVotes = houseResponse.data?.houseVotes || [];
            
            for (const vote of houseVotes) {
                const voteId = `house-${vote.congress}-${vote.session}-${vote.rollNumber}`;
                const voteDate = new Date(vote.date);
                const hoursSinceVote = (Date.now() - voteDate.getTime()) / (1000 * 60 * 60);
                
                // Only consider votes from the last 24 hours
                if (hoursSinceVote > 24) continue;
                if (this.hasSeenItem(voteId)) continue;

                this.markItemAsSeen(voteId);
                
                return {
                    title: `🗳️ HOUSE VOTE: ${vote.question || 'Unknown Question'}`,
                    url: `https://clerk.house.gov/Votes/${vote.congress}/${vote.rollNumber}`,
                    details: `Roll #${vote.rollNumber} - ${vote.result || 'Unknown Result'} (${vote.yea || 0}-${vote.nay || 0}) - ${this.formatDate(vote.date)}`
                };
            }
        } catch (error) {
            this.logError('Error fetching House votes', error);
        }

        // TODO: Add Senate votes when endpoint becomes available
        return null;
    }

    async getBillDetails(congress, billType, billNumber) {
        if (!this.apiConfig.token) {
            throw new Error('Congress API token not configured');
        }

        try {
            const response = await axios.get(
                `${this.apiConfig.baseUrl}/bill/${congress}/${billType}/${billNumber}`,
                {
                    headers: { 'X-API-Key': this.apiConfig.token },
                    params: { format: 'json' },
                    timeout: this.requestTimeout
                }
            );

            return response.data?.bill || null;
        } catch (error) {
            this.logError(`Error fetching bill details for ${congress}/${billType}/${billNumber}`, error);
            return null;
        }
    }

    async getVoteDetails(congress, chamber, rollNumber) {
        if (!this.apiConfig.token) {
            throw new Error('Congress API token not configured');
        }

        try {
            const endpoint = chamber === 'house' ? 'house-vote' : 'senate-vote';
            const response = await axios.get(
                `${this.apiConfig.baseUrl}/${endpoint}/${congress}/${rollNumber}`,
                {
                    headers: { 'X-API-Key': this.apiConfig.token },
                    params: { format: 'json' },
                    timeout: this.requestTimeout
                }
            );

            return response.data || null;
        } catch (error) {
            this.logError(`Error fetching vote details for ${congress}/${chamber}/${rollNumber}`, error);
            return null;
        }
    }

    formatDate(dateString) {
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    getCurrentCongress() {
        return this.apiConfig.currentCongress;
    }

    getSupportedBillTypes() {
        return [...this.billTypes];
    }

    isAPIConfigured() {
        return !!this.apiConfig.token;
    }

    updateCurrentCongress(congress) {
        this.apiConfig.currentCongress = congress;
        this.logInfo(`Updated current Congress to ${congress}`);
    }
}

module.exports = CongressEndpoint;