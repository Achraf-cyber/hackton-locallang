def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_localize_mocked(client):
    response = client.post(
        "/localize",
        json={"text_fr": "Bonjour tout le monde", "lang": "dyu"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "translated" in data
    assert "audio_url" in data


def test_localize_missing_lang(client):
    response = client.post(
        "/localize",
        json={"text_fr": "Bonjour tout le monde"},
    )
    assert response.status_code == 422


def test_to_french_mocked(client):
    response = client.post(
        "/to-french",
        json={"text": "i ni ce", "lang": "dyu"},
    )
    assert response.status_code == 200
    assert "text_fr" in response.json()


def test_to_french_missing_lang(client):
    response = client.post("/to-french", json={"text": "i ni ce"})
    assert response.status_code == 422


def test_transcribe_missing_file(client):
    response = client.post(
        "/transcribe",
        data={"lang": "dyu"},
    )
    assert response.status_code == 422
