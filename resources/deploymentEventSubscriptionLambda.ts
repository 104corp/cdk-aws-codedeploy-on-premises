import { SNSEvent } from 'aws-lambda';
import { IncomingMessage } from 'http';
import * as https from 'https';
import * as url from 'url';

export const handler = (event: SNSEvent): void => {
  console.log(`Debug event: ${event}`);
  const subject = event.Records[0].Sns.Subject;
  const webhookURL = url.parse(process.env.SLACK_WEBHOOK_URL as string);

  const req = https.request(
    {
      hostname: webhookURL.host,
      port: 443,
      path: webhookURL.path,
      method: 'POST',
      headers: {
        'Context-Type': 'application/json',
      },
    },
    (res: IncomingMessage) => {
      console.log(`STATUS: ${res.statusCode}`);
      res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
      });
    }
  );
  req.write(
    JSON.stringify({
      text: `${process.env.STAGE}: ${subject}`,
    })
  );
  req.end();
};
