async function sendBookingToBitrix(bookingData) {

    const WEBHOOK_URL =
    "https://b24-ynjca8.bitrix24.ru/rest/1/3b6t7atvg5tvbgre/crm.contact.add.json";

    const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                NAME: bookingData.name,
                EMAIL: [
                    {
                        VALUE: bookingData.email,
                        VALUE_TYPE: "WORK"
                    }
                ],

                UF_CRM_1777888128:
                    bookingData.training_name,

                UF_CRM_1777902099:
                    bookingData.status,

                UF_CRM_1777888460:
                    bookingData.address,
                    
                UF_CRM_1777888519:
                    bookingData.price,

                UF_CRM_1777888599:
                    bookingData.schedule_id
            }
        })
    });

    return await response.json();
}