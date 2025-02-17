const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Papa = require('papaparse');

const DATA_FOLDER = path.join(__dirname, '../data');
const POST_IDS_FILE = path.join(DATA_FOLDER, 'congress_seen_bill.csv');

class CongressBills {
    constructor(apiKey, apiUrl) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.seenBills = new Map();
        this.loadSeenBills();
    }

    async fetchBills() {
        try {
            const requestUrl = `${this.apiUrl}?api_key=${this.apiKey}`;
            console.log(`Request URL: ${requestUrl}`);
            
            const response = await fetch(requestUrl, { method: 'GET' });
            const contentType = response.headers.get('content-type');

            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error(`Unexpected response type: ${contentType}`);
                console.error(`Response body: ${text}`);
                throw new Error(`Invalid content type. Expected application/json but received ${contentType}. Response: ${text}`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            //console.log(data);
            return data.bills;
        } catch (error) {
            console.error('Error fetching data:', error);
            return [];
        }
    }

    loadSeenBills() {
        if (fs.existsSync(POST_IDS_FILE)) {
            fs.createReadStream(POST_IDS_FILE)
                .pipe(csv())
                .on('data', (row) => {
                    this.seenBills.set(row.billId, { sent: row.sent === 'true', title: row.title, url: row.url });
                });
        }
    }

    saveBillsToCsv(bills) {
        const newBills = bills.filter(bill => !this.seenBills.has(bill.url));
        const csvData = newBills.map(bill => ({
            billId: bill.url,
            title: bill.title,
            url: this.createBillUrl(bill),
            sent: 'false'
        }));
    
        const oldData = [];
        if (fs.existsSync(POST_IDS_FILE)) {
            fs.createReadStream(POST_IDS_FILE)
                .pipe(csv())
                .on('data', (row) => {
                    oldData.push(row);
                })
                .on('end', () => {
                    const dataToWrite = oldData.concat(csvData);
                    const csvContent = Papa.unparse(dataToWrite, { header: true });
                    fs.writeFileSync(POST_IDS_FILE, csvContent);
                });
        } else {
            const dataToWrite = csvData;
            const csvContent = Papa.unparse(dataToWrite, { header: true });
            fs.writeFileSync(POST_IDS_FILE, csvContent);
        }
    
        newBills.forEach(bill => {
            this.seenBills.set(bill.url, { sent: false, title: bill.title, url: this.createBillUrl(bill) });
        });
    
        return csvData;
    }

    markBillAsSent(billId) {
        const bill = this.seenBills.get(billId);
        if (bill) {
            bill.sent = true;
            this.saveSeenBills();
        }
    }

    saveSeenBills() {
        const dataToWrite = Array.from(this.seenBills.entries()).map(([billId, { sent, title, url }]) => ({
            billId,
            title,
            url,
            sent: sent.toString()
        }));

        const csvContent = Papa.unparse(dataToWrite, { header: true });
        fs.writeFileSync(POST_IDS_FILE, csvContent);
    }

    createBillUrl(bill) {
        const congressNumber = this.formatCongressNumber(bill.congress);
        const chamber = bill.originChamber.toLowerCase() === 'house' ? 'house' : 'senate';
        const billType = bill.type.toLowerCase() === 'hres' ? 'resolution' : 'bill';
        return `https://www.congress.gov/bill/${congressNumber}-congress/${chamber}-${billType}/${bill.number}`;
    }

    formatCongressNumber(congress) {
        const suffix = ["th", "st", "nd", "rd"];
        const value = congress % 100;
        return `${congress}${(suffix[(value - 20) % 10] || suffix[value] || suffix[0])}`;
    }

    getBillToRespond() {
        for (const [billId, { sent, title, url }] of this.seenBills.entries()) {
            if (!sent) {
                this.markBillAsSent(billId); // Mark the bill as sent
                return { billId, title, url };
            }
        }
        return null;
    }
}

module.exports = CongressBills;