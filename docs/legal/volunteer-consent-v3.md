# Vaani-AI Volunteer Caller Consent Form (v3)

**Bilingual: English + हिंदी · Anand-reviewed · 2026-06-26**

Every person who makes a call into the Vaani-AI demonstration — at the hackathon, during dress rehearsals, or in any pre-recorded video — must read AND sign this form **before** the call starts. Print or share digitally; either is fine, but a signed copy must exist for every volunteer for every session.

The form has THREE parts:
1. What this is and isn't (verbatim disclosure)
2. What we will do with your call (data flow + retention)
3. Your rights + signature

---

## 1 · What this is and isn't · यह क्या है और क्या नहीं

**EN:** Vaani-AI is a *research prototype*. It exists to demonstrate the technology to judges, investors, and clinical advisors — NOT to provide medical care. By signing this form you confirm you understand:

- The voice you will hear on the call ("Vaani") is an **artificial intelligence**. It is NOT a doctor, nurse, or registered medical practitioner.
- **No diagnosis, treatment, prescription, or clinical advice** is being offered to you on this call. If you have a real medical concern, please call your primary-care physician, dial 108 (ambulance), or visit a hospital.
- A **real human doctor** (named on the cockpit screen, SMC-verified, HPR-linked under ABDM) reviews the AI's report after the call, but the doctor is **not seeing or treating you for any real medical condition** in this demonstration.
- The call is **recorded** — voice audio and a text transcript — and shown live to people in the room. The recording belongs to the project for the duration of the demonstration day; after that, it is either retained for research with your separate written permission, or deleted.

**हिंदी:** वाणी-AI एक *रिसर्च प्रोटोटाइप* है। यह सिर्फ़ निर्णायकों, निवेशकों और मेडिकल सलाहकारों को तकनीक दिखाने के लिए बनाया गया है — किसी भी मरीज़ का इलाज करने के लिए नहीं। इस फ़ॉर्म पर हस्ताक्षर करके आप पुष्टि कर रहे हैं कि आपको पता है:

- कॉल पर जो आवाज़ ("वाणी") सुनाई देगी वो एक **AI** है। यह डॉक्टर, नर्स या रजिस्टर्ड मेडिकल प्रैक्टिशनर नहीं है।
- इस कॉल पर **कोई निदान, इलाज, पर्चा या मेडिकल सलाह नहीं** दी जा रही। अगर आपको सच में कोई तकलीफ़ है तो अपने डॉक्टर को कॉल कीजिए, 108 डायल कीजिए, या अस्पताल जाइए।
- कॉकपिट स्क्रीन पर जो **असली डॉक्टर साहब** का नाम है (SMC-प्रमाणित, ABDM के तहत HPR से जुड़े हुए) वो AI की रिपोर्ट देखते हैं — लेकिन इस प्रदर्शन में वो आपका कोई वास्तविक इलाज नहीं कर रहे।
- कॉल **रिकॉर्ड** होती है — आवाज़ + लिखित ट्रांसक्रिप्ट — और कमरे में लोगों को दिखाई जाती है। डेमो के दिन तक रिकॉर्डिंग प्रोजेक्ट के पास रहेगी; उसके बाद या तो आपकी अलग लिखित अनुमति से रिसर्च के लिए रखी जाएगी, या मिटा दी जाएगी।

---

## 2 · What we will do with your call · आपकी कॉल के साथ हम क्या करेंगे

**EN — data flow:**

| Step | What happens | Where the data lives |
|------|--------------|----------------------|
| 1 | You speak; Vaani records audio | Daily.co (VAPI's WebRTC vendor), Mumbai region |
| 2 | Audio → text by Deepgram (US) | Deepgram US, encrypted in transit |
| 3 | Text → AI clinical screening by Anthropic Claude (US) | Anthropic US, PII tokens used where possible |
| 4 | AI writes a draft clinical note | Supabase Postgres, Mumbai (ap-south-1) |
| 5 | The real RMP at the cockpit reviews + signs (or rejects) | Supabase Postgres, Mumbai |
| 6 | Vaani plays a follow-up message back to you | ElevenLabs TTS, returned in-band |
| 7 | Demo ends; recording handling per your choice on §3 below | — |

**हिंदी — आपका डेटा कहाँ जाता है:**

| क्रम | क्या होता है | डेटा कहाँ रहता है |
|------|-------------|------------------|
| 1 | आप बोलते हैं; वाणी आवाज़ रिकॉर्ड करती है | Daily.co (मुंबई) |
| 2 | आवाज़ → लिखित ट्रांसक्रिप्ट (Deepgram, US) | Deepgram US, सुरक्षित ट्रांज़िट में |
| 3 | लिखित ट्रांसक्रिप्ट → AI स्क्रीनिंग (Anthropic, US) | Anthropic US, जहाँ संभव हो PII टोकनाइज़्ड |
| 4 | AI एक ड्राफ़्ट मेडिकल नोट लिखता है | Supabase Postgres, मुंबई |
| 5 | कॉकपिट पर असली डॉक्टर साहब समीक्षा करते हैं | Supabase Postgres, मुंबई |
| 6 | वाणी एक फ़ॉलो-अप मेसेज वापस सुनाती है | ElevenLabs TTS |
| 7 | डेमो ख़त्म — रिकॉर्डिंग के साथ क्या करना है, §3 में आपका विकल्प |  |

**Cross-border note · सीमा-पार सूचना:** Steps 2 and 3 process your audio + transcript outside India (United States). This is the legal disclosure required under DPDP Act 2023 s.16. We log every such transfer in `cross_border_transfers` with a session token, not your name or phone.

---

## 3 · Your rights + signature · आपके अधिकार + हस्ताक्षर

You have the right to:

- **Withdraw at any time** during the call by saying **"रोको"** (Hindi) / **"stop"** (English). The call ends immediately and the recording is deleted from our queue. *(DPDP s.6(4))*
- **Refuse the recording** before the call starts. If you don't want to be recorded, do not sign this form — we won't be offended; please tell the producer and someone else will take the demo seat.
- **Erase the recording** after the demo. Tick `[ ] DELETE` below.
- **Get a copy** of your recording for your own records. Tick `[ ] COPY` below.
- **Ask questions** to the producer or to our legal counsel (`Adv. Anand Subramanian`, contact on `docs/legal/contacts.md` — TODO before T-1).

आपको ये अधिकार हैं:

- कॉल के दौरान कभी भी **"रोको"** कहकर बातचीत बंद कर सकते हैं। रिकॉर्डिंग तुरंत मिटा दी जाएगी।
- कॉल शुरू होने से पहले **रिकॉर्डिंग से इनकार** कर सकते हैं। फ़ॉर्म पर हस्ताक्षर न कीजिए, प्रोड्यूसर को बताइए।
- डेमो ख़त्म होने के बाद **रिकॉर्डिंग मिटवा सकते हैं** — नीचे `[ ] DELETE` पर टिक कीजिए।
- अपनी रिकॉर्डिंग की **कॉपी ले सकते हैं** — नीचे `[ ] COPY` पर टिक कीजिए।

### Signature block

| Field | Value |
|-------|-------|
| Full name (volunteer) | _______________________________________ |
| Phone (E.164, optional — for copy delivery only) | _______________________________________ |
| Age (must be 18+) | _______________ |
| Date + time of demo | _______________________________________ |
| Producer / witness name | _______________________________________ |

**After the demo, please handle my recording as follows · डेमो के बाद मेरी रिकॉर्डिंग के साथ:**

- [ ] DELETE — erase it from all systems within 7 days *(DPDP s.6(4) standard)*
- [ ] RESEARCH — retain (anonymised) for product research, with my separate written consent attached
- [ ] COPY — send me a copy at the phone / email above before deletion
- [ ] (default if nothing ticked) — same as DELETE

**Volunteer signature · स्वयंसेवक के हस्ताक्षर:** _______________________________________

**Producer signature · प्रोड्यूसर के हस्ताक्षर:** _______________________________________

**Witness signature · गवाह के हस्ताक्षर:** _______________________________________

*Anand to counter-sign before T-7 dress rehearsal. Signed scans to live in a project-private folder, not the public repo.*

---

## Version history

- **v1** (pre-Manorama-pivot): referenced an "AI MO Agent (Manorama)" and a CONDITIONAL-GO regime with 7 Anand conditions.
- **v2** (drafts): never reached print.
- **v3** (2026-06-26, this version): aligned with the post-Manorama architecture in `docs/architecture-change-2026-06-26-real-rmp.md` — handoff target is a real RMP at the cockpit, never another AI. The voice on the call ("Vaani") is the only AI in the patient-facing path.
