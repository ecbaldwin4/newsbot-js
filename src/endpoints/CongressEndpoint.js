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
                    
                    // Debug: Log available bill properties to understand API response
                    this.logDebug(`Bill ${billId} properties:`, Object.keys(bill).join(', '));
                    
                    // Only consider bills updated in the last 24 hours
                    if (hoursSinceUpdate > 24) continue;
                    
                    if (this.hasSeenItem(billId)) continue;

                    this.markItemAsSeen(billId);
                    
                    let billData = bill;
                    
                    // Try to get detailed bill information for sponsor data if not available
                    if (!bill.sponsors || bill.sponsors.length === 0) {
                        try {
                            const detailedBill = await this.getBillDetails(bill.congress, bill.type, bill.number);
                            if (detailedBill) {
                                billData = detailedBill;
                            }
                        } catch (error) {
                            this.logDebug(`Could not fetch detailed bill info for ${billId}:`, error.message);
                        }
                    }
                    
                    // Build comprehensive details
                    let details = `${bill.type.toUpperCase()} ${bill.number} - Updated: ${this.formatDate(bill.updateDateIncludingText)}`;
                    
                    // Add sponsor information
                    if (billData.sponsors && billData.sponsors.length > 0) {
                        const sponsor = billData.sponsors[0];
                        const sponsorInfo = `${sponsor.fullName || `${sponsor.firstName} ${sponsor.lastName}`} (${sponsor.party}-${sponsor.state}${sponsor.district ? `-${sponsor.district}` : ''})`;
                        details += `\nSponsor: ${sponsorInfo}`;
                    } else {
                        // Fallback: show that sponsor info is unavailable  
                        details += `\nSponsor: [Info not available]`;
                    }
                    
                    // Add legislative status
                    const status = this.determineLegislativeStatus(billData);
                    if (status) {
                        details += `\nStatus: ${status}`;
                    }
                    
                    // Add policy area
                    if (billData.policyArea && billData.policyArea.name) {
                        details += `\nPolicy Area: ${billData.policyArea.name}`;
                    }
                    
                    // Add latest action
                    if (billData.latestAction && billData.latestAction.text) {
                        const actionDate = billData.latestAction.date ? ` (${this.formatDate(billData.latestAction.date)})` : '';
                        details += `\nLatest Action: ${billData.latestAction.text}${actionDate}`;
                    }
                    
                    return {
                        title: `📋 BILL UPDATE: ${billData.title || bill.title}`,
                        url: `https://congress.gov/bill/${bill.congress}th-congress/${bill.type}/${bill.number}`,
                        details: details
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

    determineLegislativeStatus(bill) {
        // Check if bill became law
        if (bill.latestAction && bill.latestAction.text) {
            const actionText = bill.latestAction.text.toLowerCase();
            
            if (actionText.includes('became public law') || actionText.includes('signed by president')) {
                return 'Became Law';
            }
            
            if (actionText.includes('vetoed') || actionText.includes('pocket veto')) {
                return 'Vetoed';
            }
            
            if (actionText.includes('presented to president') || actionText.includes('sent to president')) {
                return 'Sent to President';
            }
            
            // House actions
            if (actionText.includes('passed house') || actionText.includes('passed/agreed to in house')) {
                // Check if also passed Senate
                if (actionText.includes('passed senate') || actionText.includes('passed/agreed to in senate')) {
                    return 'Passed Both Chambers';
                }
                return 'Passed House';
            }
            
            // Senate actions
            if (actionText.includes('passed senate') || actionText.includes('passed/agreed to in senate')) {
                return 'Passed Senate';
            }
            
            // Committee actions
            if (actionText.includes('reported by committee') || actionText.includes('reported to')) {
                return 'Reported by Committee';
            }
            
            if (actionText.includes('referred to committee') || actionText.includes('referred to the committee')) {
                return 'In Committee';
            }
            
            // Floor actions
            if (actionText.includes('rule for consideration') || actionText.includes('placed on calendar')) {
                return 'Scheduled for Floor';
            }
            
            // Introduction
            if (actionText.includes('introduced') || actionText.includes('submitted')) {
                return 'Introduced';
            }
        }
        
        // Fallback: determine status by bill type and basic info
        if (bill.introducedDate) {
            return 'Introduced';
        }
        
        return null;
    }
}

module.exports = CongressEndpoint;