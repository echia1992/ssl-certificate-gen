// //api/check-dns //if ver
// import { NextRequest, NextResponse } from "next/server";
// import { exec } from "child_process";
// import { promisify } from "util";

// const execAsync = promisify(exec);

// export async function POST(request: NextRequest) {
//   try {
//     const { records } = await request.json();

//     if (!records || !Array.isArray(records)) {
//       return NextResponse.json(
//         { success: false, error: "DNS records array is required" },
//         { status: 400 }
//       );
//     }

//     const verificationResults = await Promise.all(
//       records.map(async (record: any) => {
//         try {
//           const { stdout } = await execAsync(`dig +short TXT ${record.name}`);
//           const dnsValues = stdout
//             .split("\n")
//             .filter((line) => line.trim())
//             .map((line) => line.replace(/"/g, ""));

//           const isVerified = dnsValues.includes(record.value);

//           return {
//             ...record,
//             verified: isVerified,
//             currentValues: dnsValues,
//           };
//         } catch (error) {
//           return {
//             ...record,
//             verified: false,
//             error: "DNS lookup failed",
//           };
//         }
//       })
//     );

//     const allVerified = verificationResults.every((result) => result.verified);
//     const pendingRecords = verificationResults.filter(
//       (result) => !result.verified
//     );

//     return NextResponse.json({
//       verified: allVerified,
//       records: verificationResults,
//       pendingRecords,
//     });
//   } catch (error) {
//     console.error("DNS verification error:", error);
//     return NextResponse.json(
//       { success: false, error: "DNS verification failed" },
//       { status: 500 }
//     );
//   }
// }
