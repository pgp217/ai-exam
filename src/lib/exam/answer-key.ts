// 정답 키와 채점 기준표를 서버 코드에서만 쓰도록 막는다.
// 클라이언트 컴포넌트에서 import 하면 빌드가 실패한다.
import "server-only";

export * from "./answer-key.data";
