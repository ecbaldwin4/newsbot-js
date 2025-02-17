const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

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
            const response = await fetch(`${this.apiUrl}?api_key=${this.apiKey}`, { method: 'GET' });
            const contentType = response.headers.get('content-type');

            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error(`Unexpected response type: ${contentType}`);
                console.error(`Response body: ${text}`);
                throw new Error(`Invalid content type. Expected application/json but received ${contentType}.`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
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

        let oldData = [];
        if (fs.existsSync(POST_IDS_FILE)) {
            oldData = fs.readFileSync(POST_IDS_FILE, 'utf-8')
                .split('\n')
                .slice(1) // skip the header row
                .map(row => row.split(','))
                .map(([billId, title, url, sent]) => ({ billId, title, url, sent }));
        }

        const dataToWrite = oldData.concat(csvData);
        const csvHeaders = "billId,title,url,sent\n";
        const csvRows = dataToWrite.map(bill => `${bill.billId},${bill.title},${bill.url},${bill.sent}`).join('\n');

        fs.writeFileSync(POST_IDS_FILE, csvHeaders + csvRows);

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

        const csvHeaders = "billId,title,url,sent\n";
        const csvRows = dataToWrite.map(bill => `${bill.billId},${bill.title},${bill.url},${bill.sent}`).join('\n');

        fs.writeFileSync(POST_IDS_FILE, csvHeaders + csvRows);
    }

    createBillUrl(bill) {
        const congressNumber = this.formatCongressNumber(bill.congress);
        const chamber = bill.originChamber.toLowerCase() === 'house' ? 'house' : 'senate';
        return `https://www.congress.gov/bill/${congressNumber}-congress/${chamber}-bill/${bill.number}/text`;
    }

    formatCongressNumber(congress) {
        const suffix = ["th", "st", "nd", "rd"];
        const value = congress % 100;
        return `${congress}${(suffix[(value - 20) % 10] || suffix[value] || suffix[0])}`;
    }

    getBillToRespond() {
        for (const [billId, { sent, title, url }] of this.seenBills.entries()) {
            if (!sent) {
                return { billId, title, url };
            }
        }
        return null;
    }
}

module.exports = CongressBills;