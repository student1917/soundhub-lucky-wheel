import { useEffect, useRef, useState } from "react";

// Lượt quay được kiểm tra và lưu theo số điện thoại trên máy chủ MongoDB.

const VOUCHERS = [
  { value: 200000, label: "200K", color: "#e1f3ed", probability: 60 },
  { value: 300000, label: "300K", color: "#fff0d5", probability: 20 },
  { value: 400000, label: "400K", color: "#eee7fb", probability: 15 },
  { value: 500000, label: "500K", color: "#ffe1dc", probability: 5 },
];

const money = (value) => value.toLocaleString("vi-VN") + "đ";

function voucherIndex(record) {
  return VOUCHERS.findIndex((voucher) => voucher.value === record.value);
}

function sectorCenterAngle(index) {
  return index * (360 / VOUCHERS.length);
}

function targetAngle(index) {
  return (360 - sectorCenterAngle(index)) % 360;
}

function sectorLabelPosition(index) {
  const angle = (sectorCenterAngle(index) * Math.PI) / 180;
  const radius = 33;

  return {
    left: `${50 + Math.sin(angle) * radius}%`,
    top: `${50 - Math.cos(angle) * radius}%`,
    transform: "translate(-50%, -50%)",
  };
}

function wheelGradient() {
  const sliceAngle = 360 / VOUCHERS.length;
  const stops = VOUCHERS.map((voucher, index) => {
    const start = index * sliceAngle;
    const end = (index + 1) * sliceAngle;
    return `${voucher.color} ${start}deg ${end}deg`;
  });

  return `conic-gradient(from ${-sliceAngle / 2}deg, ${stops.join(", ")})`;
}

export default function App() {
  const [rotation, setRotation] = useState(0);
  const [animateWheel, setAnimateWheel] = useState(false);
  const [ready] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(true);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const pendingResult = useRef(null);
  const savedRecord = useRef(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const fallbackTimer = useRef(null);
  const modalButton = useRef(null);
  const resultButton = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(fallbackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!showModal) return;
    modalButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showModal]);

  function restoreResult(record) {
    if (!record) return;
    const index = voucherIndex(record);
    if (index < 0) return;
    savedRecord.current = record;
    setAnimateWheel(false);
    setRotation(targetAngle(index));
    setResult(VOUCHERS[index]);
  }

  async function sendSpinRequest(action, phoneNumber) {
    const response = await fetch("/api/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, phone: phoneNumber }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Không xử lý được yêu cầu.");
    }
    return data;
  }

  async function checkPhone(event) {
    event.preventDefault();
    setError("");
    setCheckingPhone(true);
    try {
      const data = await sendSpinRequest("check", phoneInput);
      setPhone(phoneInput.trim());
      setShowPhoneModal(false);
      if (data.alreadyPlayed && data.result) {
        restoreResult({ value: data.result.value, label: data.result.label });
        setShowModal(true);
      }
    } catch (err) {
      setError(err.message || "Có lỗi khi kiểm tra số điện thoại.");
    } finally {
      setCheckingPhone(false);
    }
  }

  function closeModal() {
    setShowModal(false);
    requestAnimationFrame(() => resultButton.current?.focus());
  }

  function finishSpin() {
    if (pendingResult.current === null) return;
    const voucher = pendingResult.current;
    pendingResult.current = null;
    clearTimeout(fallbackTimer.current);
    if (!mounted.current) return;
    setResult(voucher);
    setSpinning(false);
    setShowModal(true);
  }

  async function spin() {
    if (!phone) {
      setShowPhoneModal(true);
      return;
    }
    if (busy.current || savedRecord.current || pendingResult.current !== null) return;

    busy.current = true;
    setClaiming(true);
    setError("");
    try {
      // Máy chủ chọn voucher và lưu vào MongoDB trước khi bắt đầu hiệu ứng.
      const data = await sendSpinRequest("spin", phone);
      if (!data.result) {
        throw new Error("Chưa nhận được kết quả voucher. Vui lòng thử lại.");
      }
      const record = { value: data.result.value, label: data.result.label };
      const index = voucherIndex(record);
      if (index < 0) throw new Error("Không tìm thấy voucher trong danh sách.");
      savedRecord.current = record;
      if (!mounted.current) return;

      // Nếu số điện thoại vừa được dùng ở tab khác, hiện kết quả đã lưu.
      if (data.alreadyPlayed) {
        restoreResult(record);
        setShowModal(true);
        return;
      }

      pendingResult.current = VOUCHERS[index];
      setAnimateWheel(true);
      setSpinning(true);
      setShowModal(false);
      setRotation((current) => {
        const currentAngle = ((current % 360) + 360) % 360;
        const remaining = (targetAngle(index) - currentAngle + 360) % 360;
        return current + 360 * 7 + remaining;
      });
      fallbackTimer.current = setTimeout(finishSpin, 6500);
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Không thể lưu lượt quay. Vui lòng thử lại.");
      }
    } finally {
      busy.current = false;
      if (mounted.current) setClaiming(false);
    }
  }

  const disabled =
    !ready || !phone || claiming || spinning || Boolean(result);

  return (
    <main className="voucher-app">
      <style>{styles}</style>

      <section className="game-card">
        <header className="game-header">
          <span className="eyebrow">
            <img src="https://soundhub.vn/wp-content/uploads/2026/10/1792398839334_5569772838462539200_5569772838462539200_4d37eb2ebf2645578070c51250d45d91-removebg-preview.png" alt="" className="logo"/>
        
            <span style={{color: "#0877FB"}} /> FOOD & GOOD with SOUNDHUB
          </span>

          <h1 style={{color: "#396b56"}}>
            Vòng quay may mắn
            <br />
            {/* <span>may mắn trong tay.</span> */}
          </h1>

          <p>Wishing you a beautiful day ahead!</p>

          <span className="once-badge">
            ✦ Just once per person.
          </span>
        </header>

        <div className="wheel-stage">
          <div className={`pointer ${spinning ? "pointer-moving" : ""}`}>
            <svg viewBox="0 0 44 58" aria-hidden="true">
              <path
                d="M5 5 Q22 -3 39 5 L27 46 Q22 59 17 46 Z"
                fill="#ffffff"
                stroke="#b98b44"
                strokeWidth="3"
              />
              <circle cx="22" cy="14" r="5" fill="#c49a59" />
            </svg>
          </div>

          <div className="wheel-frame">
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className="bulb-orbit"
                style={{ transform: `rotate(${i * 15}deg)` }}
                aria-hidden="true"
              >
                <span className="bulb" />
              </span>
            ))}

            <div
              className={`wheel ${animateWheel ? "wheel-animated" : ""}`}
              style={{
                transform: `rotate(${rotation}deg)`,
                background: wheelGradient(),
              }}
              onTransitionEnd={(event) => {
                if (
                  event.target === event.currentTarget &&
                  event.propertyName === "transform"
                ) {
                  finishSpin();
                }
              }}
            >
              {VOUCHERS.map((voucher, index) => (
                <div
                  className="sector-label"
                  key={voucher.value}
                  style={sectorLabelPosition(index)}
                >
                  <strong>{voucher.label}</strong>
                </div>
              ))}
            </div>

            <div className="wheel-hub">
              <span>✦</span>
              <small>GOOD LUCK</small>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="spin-button"
          onClick={spin}
          disabled={disabled}
        >
          {!ready ? (
            "ĐANG KIỂM TRA LƯỢT QUAY..."
          ) : error ? (
            "CHƯA THỂ QUAY"
          ) : claiming || spinning ? (
            <>
              <span className="button-spinner" />
              May mắn đang đến...
            </>
          ) : result ? (
            "✓ BẠN ĐÃ SỬ DỤNG LƯỢT QUAY"
          ) : (
            <>
              QUAY NHẬN VOUCHER <span>↗</span>
            </>
          )}
        </button>

        <p
          className={`helper-text ${error ? "helper-error" : ""}`}
          aria-live="polite"
          role={error ? "alert" : undefined}
        >
          {error ||
            (!ready
              ? "Đang kiểm tra kết quả đã lưu..."
              : claiming || spinning
                ? "Chờ một chút nhé, món quà của bạn đang đến."
                : result
                  ? "Kết quả đã được lưu. Bạn có thể xem lại voucher bên dưới."
                  : "Bạn có một lượt quay duy nhất. Chúc bạn may mắn!")}
        </p>

        <div className="prize-list">
          {VOUCHERS.map((voucher) => (
            <div className="prize-chip" key={voucher.value}>
              <span style={{ background: voucher.color }} />
              {money(voucher.value)}
            </div>
          ))}
        </div>

        {/* <div style={{ margin: 15 } }>
          <p style={{ fontWeight: 700, marginBottom:15, color:"#286F59" }}>Voucher thương hiệu</p>

          <div className="prize-list">
            {[
              "Starbucks",
              "BreadTalk",
              "San Fu Lou",
              "Pizza 4P's",
              "Hoàng Yến Buffet",
              "Tous les Jours",
              "Phúc Long",
              "Katinat",
              "Koi Thé",
              "The Coffee House",
              "Trung Nguyên",
            ].map((brand) => (
              <div className="prize-chip" key={brand}>
                {brand} 
              </div>
            ))}
          </div>
        </div>

        <div className="note" style={{ display: "flex", flexDirection: "column" }}>

          <span>Vourcher không thể quy đổi thành tiền mặt</span>
          <span>(Có thể đổi thành card nạp điện thoại)</span>


        </div> */}

        {result && !spinning && (
          <div className="last-result">
            <span>🎉 Voucher của bạn</span>
            <strong>{money(result.value)}</strong>

            <button
              type="button"
              ref={resultButton}
              onClick={() => setShowModal(true)}
            >
              Xem lại voucher ↗
            </button>
          </div>
        )}

        <footer>Ăn ngon hơn · Vui nhiều hơn · Yêu đời hơn</footer>
      </section>

      {showPhoneModal && (
        <div className="modal-overlay phone-overlay">
          <section
            className="result-modal phone-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="gift-icon" aria-hidden="true">🎁</span>
            <p className="modal-eyebrow">SOUNDHUB</p>
            <h2 id="phone-title">Nhập số điện thoại</h2>
            <p>Số điện thoại mua laptop của bạn.</p>
            <form onSubmit={checkPhone}>
              <input
                className="phone-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ví dụ: 0912345678"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                required
                aria-label="Số điện thoại"
              />
              {error && <p className="phone-error" role="alert">{error}</p>}
              <button type="submit" className="spin-button" disabled={checkingPhone}>
                {checkingPhone ? "ĐANG KIỂM TRA..." : "TIẾP TỤC"}
              </button>
            </form>
            <small className="phone-note">
              Mỗi số điện thoại có một lượt quay trong chương trình.
            </small>
          </section>
        </div>
      )}

      {showModal && result && (
        <div className="modal-overlay" onClick={closeModal}>
          <section
            className="result-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
            aria-describedby="result-description"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeModal();

              // Dialog chỉ có một nút tương tác.
              if (event.key === "Tab") {
                event.preventDefault();
                modalButton.current?.focus();
              }
            }}
          >
            <span className="gift-icon" aria-hidden="true">🎁</span>
            <p className="modal-eyebrow">MAY MẮN GỌI TÊN BẠN</p>
            <h2 id="result-title">Chúc mừng bạn!</h2>

            <p id="result-description">
              Bữa ngon sắp tới đã có thêm một món quà.
            </p>

            <div className="voucher-ticket">
              <span>VOUCHER</span>
              <strong>{money(result.value)}</strong>
              <small>Dành cho những bữa ăn thật vui</small>
            </div>

            <button
              type="button"
              ref={modalButton}
              className="spin-button"
              onClick={closeModal}
            >
              TUYỆT VỜI! ✨
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap');

  body { margin: 0; }
  .voucher-app, .voucher-app * { box-sizing: border-box; }
  .voucher-app button { font: inherit; }

  .voucher-app {
    min-height: 100svh;
    padding: 36px 16px;
    display: grid;
    place-items: center;
    background: #ffffff;
    color: #243c34;
    font-family: 'Be Vietnam Pro', sans-serif;
  }

  .game-card {
    width: min(100%, 540px);
    text-align: center;
    padding: 36px 28px 24px;
    border: 1px solid #e8eeeb;
    border-radius: 32px;
    background: #ffffff;
    box-shadow: 0 18px 65px #254e3410;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    // color: #687d70;
    color: #0877FB;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
  }

  .eyebrow > span {
    width: 6px;
    height: 6px;
    background: #0877FB;
    border-radius: 50%;
  }

  .game-header h1 {
    margin: 20px 0 12px;
    font-size: clamp(25px, 6vw, 36px);
    font-weight: 800;
    line-height: 1.4;
    letter-spacing: -1.3px;
  }

  .game-header h1 > span { color: #28755d; }

  .game-header p {
    font-size: 12px;
    line-height: 1.8;
    color: #758179;
    margin: 0;
  }

  .once-badge {
    display: inline-block;
    margin-top: 16px;
    padding: 7px 12px;
    border-radius: 100px;
    color: #396b56;
    background: #f0f7f3;
    font-size: 10px;
    font-weight: 600;
  }

  .wheel-stage {
    width: min(100%, 390px);
    margin: 32px auto 28px;
    position: relative;
    padding-top: 14px;
  }

  .wheel-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    padding: 19px;
    border-radius: 50%;
    background: linear-gradient(135deg, #f7e9ca, #d5b57a, #f4e6c7);
    box-shadow:
      0 7px 0 #d0b27f,
      0 17px 30px #77613c1c,
      inset 0 0 0 2px #fff8e7;
  }

  .wheel {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    border-radius: 50%;
    border: 5px solid #ffffff;
  }

  .wheel-animated {
    transition: transform 6s cubic-bezier(.12, .75, .12, 1);
  }

  .sector-label {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    width: max-content;
    color: #34483e;
    pointer-events: none;
    text-align: center;
    white-space: nowrap;
  }

  .sector-label strong {
    line-height: 1;
    font-weight: 900;
    font-size: clamp(12px, 3.5vw, 16px);
    letter-spacing: -.4px;
    text-shadow: 0 1px 1px #ffffff88;
  }

  .wheel-hub {
    position: absolute;
    width: 24%;
    aspect-ratio: 1;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    border: 5px solid #f5e8cc;
    box-shadow: 0 4px 14px #775e3226;
  }

  .wheel-hub > span {
    font-size: clamp(22px, 6vw, 34px);
    color: #bc9451;
    line-height: 1;
  }

  .wheel-hub small {
    margin-top: 5px;
    font-size: 6px;
    letter-spacing: 1px;
    font-weight: 800;
    color: #8b734b;
  }

  .bulb-orbit {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .bulb {
    position: absolute;
    width: 7px;
    height: 7px;
    left: 50%;
    top: 6px;
    transform: translateX(-50%);
    background: #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 6px #fffdf0;
  }

  .pointer {
    position: absolute;
    z-index: 5;
    top: -6px;
    left: 50%;
    width: 39px;
    transform: translateX(-50%);
    transform-origin: 50% 15%;
    filter: drop-shadow(0 3px 3px #79633a2e);
  }

  .pointer svg { width: 100%; display: block; }
  .pointer-moving { animation: pointer-tick .15s infinite alternate; }

  .spin-button {
    width: min(100%, 350px);
    min-height: 58px;
    padding: 12px 16px;
    border: 1px solid #276c56;
    border-radius: 16px;
    background: #286f59;
    color: #ffffff;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 5px 0 #1d5141, 0 10px 24px #286f5917;
    transition: background .2s, translate .2s;
  }

  .spin-button:hover:not(:disabled) {
    background: #205e4b;
    translate: 0 -2px;
  }

  .spin-button:active:not(:disabled) { translate: 0 2px; }

  .spin-button:disabled {
    cursor: not-allowed;
    background: #eaf0ec;
    color: #567362;
    border-color: #dce6df;
    box-shadow: 0 3px 0 #dce5de;
  }

  .spin-button > span:not(.button-spinner) { font-size: 23px; }

  .voucher-app button:focus-visible {
    outline: 3px solid #b98b44;
    outline-offset: 4px;
  }

  .button-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #56736244;
    border-top-color: #567362;
    border-radius: 50%;
    animation: loading .7s linear infinite;
  }

  .helper-text {
    min-height: 34px;
    margin: 18px 0 12px;
    font-size: 11px;
    color: #748279;
    line-height: 1.8;
  }

  .helper-error { color: #b64838; }

  .prize-list {
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .prize-chip {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border: 1px solid #e7ece8;
    border-radius: 100px;
    font-size: 10px;
    color: #627267;
    background: #ffffff;
  }

    .prize-chip > span {
    width: 10px;
    height: 10px;
    border: 1px solid #00000012;
    border-radius: 50%;
  }

  .last-result {
    margin-top: 24px;
    padding: 18px;
    border: 1px dashed #a9c6b6;
    border-radius: 16px;
    background: #f7fbf8;
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 8px;
  }

  .last-result > span { font-size: 12px; color: #63796a; }
  .last-result > strong { font-size: 27px; color: #286f59; }

  .last-result button {
    border: 0;
    padding: 5px;
    background: transparent;
    color: #286f59;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  .logo{
    weight: 50px;
    height: 50px;
  }

  .game-card footer {
    margin-top: 25px;
    font-size: 9px;
    letter-spacing: .4px;
    color: #8b978f;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    overflow-y: auto;
    padding: 24px;
    background: #24433566;
    backdrop-filter: blur(8px);
  }

  .result-modal {
    width: min(100%, 390px);
    text-align: center;
    padding: 32px 26px;
    background: #ffffff;
    border: 1px solid #e4ece6;
    border-radius: 28px;
    color: #2e4336;
    box-shadow: 0 25px 80px #17352533;
    animation: modal-in .35s ease-out;
  }

  .gift-icon { font-size: 52px; }

  .modal-eyebrow {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #a18049;
    margin-top: 18px;
  }

  .result-modal h2 {
    margin: 12px 0;
    font-size: 28px;
    letter-spacing: -1px;
  }

  .result-modal > p:not(.modal-eyebrow) {
    font-size: 11px;
    color: #788479;
    line-height: 1.8;
  }

  .voucher-ticket {
    position: relative;
    margin: 26px 0;
    padding: 25px 12px;
    border-radius: 14px;
    background: #f2f8f4;
    border: 1px dashed #a1bca9;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .note {
  padding: 0.8rem 0 0 0;
  font-size: 0.6rem;
  color: #788479;
  }

  

  .voucher-ticket::before,
  .voucher-ticket::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    background: #ffffff;
    border-radius: 50%;
    top: calc(50% - 10px);
  }

  .voucher-ticket::before { left: -11px; }
  .voucher-ticket::after { right: -11px; }

  .voucher-ticket > span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #6a816f;
  }

  .voucher-ticket strong {
    font-size: clamp(35px, 10vw, 46px);
    font-weight: 900;
    color: #286f59;
    letter-spacing: -2px;
  }

  .voucher-ticket small { font-size: 10px; color: #7b897d; }

  @keyframes pointer-tick {
    from { transform: translateX(-50%) rotate(-5deg); }
    to { transform: translateX(-50%) rotate(5deg); }
  }

  @keyframes loading { to { transform: rotate(360deg); } }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(.92) translateY(15px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @media (max-width: 420px) {
    .voucher-app { padding: 16px 10px; }
    .game-card { padding: 28px 18px 22px; border-radius: 24px; }
    .wheel-frame { padding: 17px; }
    .spin-button { font-size: 10px; }
    .eyebrow { font-size: 9px; letter-spacing: 1.4px; }
  }


  .phone-overlay { z-index: 30; }
  .phone-modal form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 24px;
  }
  .phone-input {
    width: 100%;
    min-height: 52px;
    padding: 0 16px;
    border: 1px solid #dce6df;
    border-radius: 14px;
    font: inherit;
    font-size: 15px;
    outline-color: #286f59;
  }
  .phone-error { margin: 0; color: #b64838; font-size: 12px; }
  .phone-note {
    display: block;
    margin-top: 16px;
    color: #788479;
    font-size: 10px;
    line-height: 1.6;
  }

  @media (prefers-reduced-motion: reduce) {
    .wheel-animated { transition-duration: .2s; }
    .pointer-moving, .result-modal { animation: none; }
  }
`;