/* Câu nói huyền thoại — gán theo từng cầu thủ DUFC */

const LEGEND_QUOTES_BY_POS = {
  GK: [
    { quote: "Khung thành là lãnh thổ của tôi. Ai muốn vào phải trả giá.", author: "Gianluigi Buffon" },
    { quote: "Thủ môn không được phép sợ hãi — cả đội trông cậy vào bạn.", author: "Iker Casillas" },
    { quote: "Thủ môn phải dũng cảm — bạn là người bảo vệ cuối cùng.", author: "Manuel Neuer" }
  ],
  DEF: [
    { quote: "Nếu phải tackle nghĩa là tôi đã mắc lỗi từ trước.", author: "Paolo Maldini" },
    { quote: "Phòng ngự đích thực là đọc trận đấu trước khi bóng tới.", author: "Fabio Cannavaro" },
    { quote: "Chiến đấu hết mình cho màu áo — đó là tất cả những gì tôi biết.", author: "Carles Puyol" }
  ],
  MID: [
    { quote: "Chơi bóng đơn giản là khó nhất.", author: "Xavi" },
    { quote: "Bóng đá được chơi bằng cái đầu. Chân chỉ là công cụ.", author: "Andrea Pirlo" },
    { quote: "Một đường chuyền đúng lúc có thể thay đổi cả trận đấu.", author: "Kevin De Bruyne" }
  ],
  FWD: [
    { quote: "Tôi luôn chơi bóng vì tình yêu với trái bóng, và điều đó tiếp tục đưa tôi tiến lên phía trước.", author: "Lionel Messi" },
    { quote: "Tôi không ngừng nghỉ cho đến khi đạt được mục tiêu của mình.", author: "Erling Haaland" },
    { quote: "Không có giới hạn nào cho giấc mơ của bạn.", author: "Kylian Mbappé" }
  ]
};

/** Gán tay từng cầu thủ — key = normalizeName(name) */
const PLAYER_LEGEND_QUOTES = {
  "a nam vib": {
    quote: "Tôi luôn làm việc trong im lặng, để quả bóng nói thay lời.",
    author: "Andrés Iniesta"
  },
  "a thanh": {
    quote: "Nếu phải tackle nghĩa là tôi đã mắc lỗi từ trước.",
    author: "Paolo Maldini"
  },
  "anh phuong": {
    quote: "Mọi thứ đều là sự luyện tập. Tôi luôn muốn trở thành người giỏi nhất, và tôi đã làm việc chăm chỉ vì điều đó.",
    author: "Pelé"
  },
  "bao": {
    quote: "Bóng đá là cuộc sống của tôi. Mỗi trận đấu đều là một trận chung kết.",
    author: "Luka Modrić"
  },
  "binh nguyen": {
    quote: "Tôi không ngừng nghỉ cho đến khi đạt được mục tiêu của mình.",
    author: "Erling Haaland"
  },
  "chi kha": {
    quote: "Đám đông không tạo nên tôi. Tôi tạo nên chính mình.",
    author: "Cristiano Ronaldo"
  },
  "dat": {
    quote: "Khi còn trẻ, người ta bảo tôi quá cao để chơi bóng. Giờ thì chiều cao là vũ khí của tôi.",
    author: "Virgil van Dijk"
  },
  "dinh van": {
    quote: "Đa năng không phải điểm yếu — đó là cách bạn luôn có chỗ trên sân.",
    author: "Philipp Lahm"
  },
  "do ba tuyen": {
    quote: "Trên sân, tôi chơi mỗi trận như một trận chung kết.",
    author: "Sergio Ramos"
  },
  "do thanh tan": {
    quote: "Chơi bóng đơn giản là khó nhất.",
    author: "Xavi"
  },
  "duc": {
    quote: "Bảo vệ khung thành bắt đầu từ sự dũng cảm của hàng thủ.",
    author: "Giorgio Chiellini"
  },
  "duc anh": {
    quote: "Tiền đạo phải săn bàn ngay cả khi chỉ còn một giây.",
    author: "Sergio Agüero"
  },
  "duc hoang": {
    quote: "Tôi luôn chơi bóng vì tình yêu với trái bóng, và điều đó tiếp tục đưa tôi tiến lên phía trước.",
    author: "Lionel Messi"
  },
  "duy nguyen": {
    quote: "Phòng ngự đích thực là đọc trận đấu trước khi bóng tới.",
    author: "Fabio Cannavaro"
  },
  "hoang": {
    quote: "Hậu vệ biên cũng có thể là vũ khí tấn công của đội.",
    author: "Roberto Carlos"
  },
  "huy": {
    quote: "Bóng đá được chơi bằng cái đầu. Chân chỉ là công cụ.",
    author: "Andrea Pirlo"
  },
  "huynh tran quoc viet": {
    quote: "Không có giới hạn nào cho giấc mơ của bạn.",
    author: "Kylian Mbappé"
  },
  "kem": {
    quote: "Đứng đúng chỗ, đúng lúc — đó là nghệ thuật của người giữ nhịp.",
    author: "Sergio Busquets"
  },
  "khuu anh tai": {
    quote: "Khung thành là lãnh thổ của tôi. Ai muốn vào phải trả giá.",
    author: "Gianluigi Buffon"
  },
  "khoi gk": {
    quote: "Thủ môn phải dũng cảm — bạn là người bảo vệ cuối cùng.",
    author: "Manuel Neuer"
  },
  "le phuoc": {
    quote: "Chiến đấu hết mình cho màu áo — đó là tất cả những gì tôi biết.",
    author: "Carles Puyol"
  },
  "long": {
    quote: "Trở thành một người hoàn hảo thật nhàm chán.",
    author: "Zlatan Ibrahimović"
  },
  "minh phat": {
    quote: "Giữa sân là nơi tôi chiến đấu — ít ánh hào quang, nhiều tầm quan trọng.",
    author: "Nemanja Matić"
  },
  "nghia tran": {
    quote: "Hãy tin vào hành trình của bạn, dù không ai tin.",
    author: "Mohamed Salah"
  },
  "nguyen minh viet": {
    quote: "Thủ môn không được phép sợ hãi — cả đội trông cậy vào bạn.",
    author: "Iker Casillas"
  },
  "phuc": {
    quote: "Hậu vệ biên phải chạy cả trận — phòng ngự xong là lên công.",
    author: "Cafu"
  },
  "phuoc c2": {
    quote: "Tiền đạo giỏi không chỉ ghi bàn — mà còn kéo hàng thủ lệch nhịp.",
    author: "Karim Benzema"
  },
  "thang phan": {
    quote: "Đặt tim và linh hồn vào những gì bạn tin tưởng.",
    author: "Steven Gerrard"
  },
  "thanh tan": {
    quote: "Phòng ngự là nghệ thuật — và tôi coi mỗi pha bóng là một bức tranh.",
    author: "Nemanja Vidić"
  },
  "tuong bang": {
    quote: "Một đường chuyền đúng lúc có thể thay đổi cả trận đấu.",
    author: "Kevin De Bruyne"
  },
  "vu tuan": {
    quote: "Chơi với đam mê — dù là trên sân hay trong tim người hâm mộ.",
    author: "Francesco Totti"
  },
  "xuan diep": {
    quote: "Bóng đá là môn thể thao của đội — cá nhân không thắng trận.",
    author: "Pep Guardiola"
  }
};

function formatLegendQuote(entry){
  const quote = String(entry?.quote || "").trim();
  if(!quote) return "";
  return `"${quote}"`;
}

function legendQuoteSeed(text){
  const s = normalizeName(text);
  let h = 0;
  for(let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function lookupPlayerLegendQuote(p){
  const key = normalizeName(p?.name || "");
  const hit = PLAYER_LEGEND_QUOTES[key];
  if(hit) return formatLegendQuote(hit);

  const posRaw = String(p?.main || p?.position || "MID").trim().toUpperCase();
  const pos = ["GK", "DEF", "MID", "FWD"].includes(posRaw) ? posRaw : "MID";
  const pool = LEGEND_QUOTES_BY_POS[pos] || LEGEND_QUOTES_BY_POS.MID;
  const seed = legendQuoteSeed(`${key}|${pos}|legend`);
  const pick = pool[Math.abs(seed) % pool.length];
  return formatLegendQuote(pick);
}
