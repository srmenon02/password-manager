from app.schemas import ShareInitRequest


def test_share_init_request_accepts_recipient_email_only() -> None:
    request = ShareInitRequest(recipient_email='recipient@example.com')

    assert request.recipient_email == 'recipient@example.com'
