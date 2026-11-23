// Each option is one selectable unit. Riders which the insurer requires together
// share an option so they also stay together when removed or exported.
export const planForDisclosure = new Map([
  ["9cd1cbfedf992f2e9f42d95b20526d00", "aia-premium-cancer-1-2"],
  ["677279e22f8cbb0d95594819e268a28e", "db-medical-2605-cm"]
]);

export const plans = [
  {
    id: "aia-premium-cancer-1-2",
    insurer: "AIA생명",
    name: "무배당 원스톱 프리미엄 암보험(갱신형)",
    version: "1종 암진단보장 · 2형 일반심사형",
    base: "신일반암 및 유방암·전립선암 등의 진단을 보장하는 주계약입니다. 암의 분류와 보장개시일은 상품 안내에서 확인하세요.",
    checked: "2026-11-23",
    url: "https://direct.aia.co.kr/DMD/webin/aia_cancer",
    options: [
      {
        id: "direct-treatment",
        names: ["무배당 신일반암직접치료특약(갱신형)", "무배당 신일반암 제외한 암직접치료특약(갱신형)"],
        condition: "두 특약은 서로 필수 가입 조건이어서 함께 추가하거나 해제합니다. 보장하는 암의 범위가 서로 다릅니다."
      },
      {
        id: "polyp-surgery",
        names: ["무배당 8대기관 양성신생물 및 폴립 수술특약(갱신형)"],
        condition: "약관에서 정한 8대기관 양성신생물 및 폴립의 직접 치료를 위한 수술을 연간 1회 한도로 보장합니다."
      }
    ]
  },
  {
    id: "db-medical-2605-cm",
    insurer: "DB손해보험",
    name: "무배당 프로미라이프 다이렉트 실손의료비보험2605(CM)",
    version: "2605(CM) · 5세대 실손",
    base: "기본형은 상해·질병 급여 의료비를 보장합니다. 상품 안내 기준 가입 연령은 태아부터 70세까지이며, 1년마다 갱신하고 5년마다 재가입합니다.",
    checked: "2026-11-23",
    url: "https://www.directidb.co.kr/silson-dl/index.html",
    options: [
      {
        id: "severe",
        names: ["실손의료보험 특별약관1(중증 비급여 실손의료비)"],
        condition: "약관에서 정한 중증질환 치료와 관련된 비급여 의료비를 보장합니다."
      },
      {
        id: "non-severe",
        names: ["실손의료보험 특별약관2(비중증 비급여 실손의료비)"],
        condition: "중증질환 외의 비급여 의료비 중 약관에 해당하는 항목을 보장합니다. 도수치료 등 제외 항목을 확인하세요."
      }
    ]
  }
];
