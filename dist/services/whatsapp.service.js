import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { pseudonymizePhone } from '../utils/pii.js';
import { fetchWithTimeout } from '../utils/fetch-with-timeout.js';
export class WhatsAppDeliveryError extends Error {
    constructor(recipientPhoneNumber) {
        super('WhatsApp reply could not be delivered');
        this.name = 'WhatsAppDeliveryError';
        this.recipientHash = pseudonymizePhone(recipientPhoneNumber);
    }
    recipientHash;
}
export class WhatsAppService {
    baseUrl;
    constructor() {
        this.baseUrl = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    }
    /**
     * Sends a plain text message to a WhatsApp recipient using Meta's Cloud API.
     *
     * @param recipientPhoneNumber The recipient's phone number in international format without '+' or special characters.
     * @param message The text content of the message.
     */
    async sendTextMessage(recipientPhoneNumber, message) {
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientPhoneNumber,
            type: 'text',
            text: {
                preview_url: false,
                body: message,
            },
        };
        try {
            const response = await fetchWithTimeout(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const responseData = (await response.json().catch(() => ({})));
            if (!response.ok) {
                logger.error('WhatsApp API failure', {
                    status: response.status,
                    statusText: response.statusText,
                    recipient_id: pseudonymizePhone(recipientPhoneNumber),
                    error: responseData.error?.message || 'Unknown WhatsApp API error',
                    code: responseData.error?.code,
                });
                return null;
            }
            logger.info('WhatsApp API success', {
                recipient_id: pseudonymizePhone(recipientPhoneNumber),
                messageId: responseData.messages?.[0]?.id,
            });
            return responseData;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Network/Fetch error';
            logger.error('WhatsApp API failure', {
                recipient_id: pseudonymizePhone(recipientPhoneNumber),
                error: errorMessage,
            });
            return null;
        }
    }
    async sendTextMessageStrict(recipientPhoneNumber, message) {
        const response = await this.sendTextMessage(recipientPhoneNumber, message);
        if (!response)
            throw new WhatsAppDeliveryError(recipientPhoneNumber);
        return response;
    }
}
export const whatsappService = new WhatsAppService();
