# Deposit instructions (message template)

Send during or right after the call where they say yes. Keep payment methods to the ones
people in your market actually use: bank transfer, a card payment link (from your payment
provider), or a local instant-payment method.

> Not legal or financial advice. Never ask clients to pay into personal accounts you
> can't invoice from, and never send or request card numbers by message.

## Message

```text
Great to have you on board, {Name}.

To book your build slot for {Business}:
- Deposit: {amount} {currency} ({50%} of {total})
- Pay by: {method 1: e.g. bank transfer to {account name}, {account details}, reference "{invoice number}"}
          {method 2: e.g. card via this secure link: {payment link}}

As soon as it arrives I'll send the onboarding form (logo, photos, hours). Your site will be ready to review {delivery_days} days after I have those.

The balance of {amount} is due when you approve the finished site. {If you're not happy with it, you get the deposit back.}

Agreement and invoice attached.
{You}, {Studio} · {phone}
```

## Checklist

- [ ] Agreement sent (and agreed in writing)
- [ ] Deposit invoice sent (`invoice-fields.md`)
- [ ] Payment received → `l2p queue --won <id>`, CRM stage "Deposit paid"
- [ ] Onboarding form sent
- [ ] Build slot in your calendar
- [ ] Review and referral request scheduled for launch day
