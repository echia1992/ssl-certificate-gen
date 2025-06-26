"use client";

"use client";
import React, { useState, useEffect } from "react";

// Type definitions
interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
  placeholder?: boolean;
}

interface VerificationResult extends DnsRecord {
  verified: boolean;
  currentValues: string[];
  error?: string;
}

interface CertificateFiles {
  fullchain?: string;
  privkey?: string;
  cert?: string;
  chain?: string;
}

interface CopyButtonProps {
  text: string;
  itemId: string;
  className?: string;
}
import {
  Copy,
  Check,
  Shield,
  Globe,
  Mail,
  AlertCircle,
  Terminal,
  Download,
  FileText,
  Key,
  Award,
  Server,
  Settings,
  RefreshCw,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

const SSLGenerator: React.FC = () => {
  const [domain, setDomain] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [verificationResults, setVerificationResults] = useState<
    VerificationResult[]
  >([]);
  const [certificates, setCertificates] = useState<CertificateFiles | null>(
    null
  );
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
  const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);

  // Auto-check DNS every 30 seconds when enabled
  useEffect(() => {
    let interval;
    if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
      interval = setInterval(checkDnsRecords, 30000);
    }
    return () => clearInterval(interval);
  }, [autoCheckDns, dnsRecords, step]);

  const copyToClipboard = async (
    text: string,
    itemId: string
  ): Promise<void> => {
    try {
      const textContent =
        typeof text === "string" ? text.trim() : String(text).trim();
      await navigator.clipboard.writeText(textContent);
      setCopiedItems((prev) => new Set([...prev, itemId]));
      setTimeout(() => {
        setCopiedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const downloadAsTextFile = (content: string, filename: string): void => {
    const textContent =
      typeof content === "string" ? content.trim() : String(content).trim();
    const txtFilename = filename.endsWith(".txt")
      ? filename
      : `${filename}.txt`;
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = txtFilename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const generateDnsChallenge = async (): Promise<void> => {
    if (!domain || !email) return;

    setLoading(true);
    try {
      const response = await fetch("/api/generate-dns-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, email, includeWildcard }),
      });

      const data = await response.json();
      if (data.success) {
        setDnsRecords(data.dnsRecords);
        setStep(2);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert("Failed to generate DNS challenge. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkDnsRecords = async (): Promise<void> => {
    if (dnsRecords.length === 0) return;

    try {
      const response = await fetch("/api/verify-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: dnsRecords }),
      });

      const data = await response.json();
      setVerificationResults(data.records || []);

      if (data.verified) {
        setStep(3);
        setAutoCheckDns(false);
      }
    } catch (error) {
      console.error("DNS check failed:", error);
    }
  };

  const generateCertificates = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch("/api/generate-certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, dnsRecords }),
      });

      const data = await response.json();
      if (data.success) {
        setCertificates(data.certificates);
        setStep(4);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert("Failed to generate certificates. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = (): void => {
    setStep(1);
    setDomain("");
    setEmail("");
    setIncludeWildcard(false);
    setDnsRecords([]);
    setVerificationResults([]);
    setCertificates(null);
    setAutoCheckDns(false);
  };

  const CopyButton: React.FC<CopyButtonProps> = ({
    text,
    itemId,
    className = "",
  }) => {
    const isCopied = copiedItems.has(itemId);
    return (
      <button
        onClick={() => copyToClipboard(text, itemId)}
        className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
          isCopied
            ? "bg-green-100 text-green-700 border border-green-300"
            : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
        }`}
        title={isCopied ? "Copied!" : "Copy to clipboard"}
      >
        {isCopied ? <Check size={14} /> : <Copy size={14} />}
        {isCopied ? "Copied!" : "Copy"}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              SSL Certificate Generator
            </h1>
          </div>
          <p className="text-gray-600">
            Generate free SSL certificates for any domain with step-by-step
            guidance
          </p>
        </div>

        {/* Progress Steps */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            {[
              { num: 1, title: "Domain Info", icon: Globe },
              { num: 2, title: "DNS Records", icon: Settings },
              { num: 3, title: "Verification", icon: CheckCircle },
              { num: 4, title: "Certificates", icon: Award },
            ].map(({ num, title, icon: Icon }) => (
              <div key={num} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full ${
                    step >= num
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {step > num ? <Check size={20} /> : <Icon size={20} />}
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700">
                  {title}
                </span>
                {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Domain Information */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 1: Enter Domain Information
            </h3>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Globe size={16} />
                    Domain Name
                  </label>
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Mail size={16} />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wildcard"
                  checked={includeWildcard}
                  onChange={(e) => setIncludeWildcard(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="wildcard" className="text-sm text-gray-700">
                  Include wildcard certificate (*.{domain || "example.com"})
                </label>
              </div>
              <button
                onClick={generateDnsChallenge}
                disabled={loading || !domain || !email}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading
                  ? "Generating DNS Challenge..."
                  : "Generate DNS Challenge"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: DNS Records */}
        {step === 2 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 2: Add DNS TXT Records for {domain}
            </h3>
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Instructions:</strong> Add these DNS TXT records to your
                domain's DNS settings, then click "Check DNS" to verify they're
                propagated.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              {dnsRecords.map((record, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        Record Name
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
                          {record.name}
                        </code>
                        <CopyButton
                          text={record.name}
                          itemId={`name-${index}`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        Record Type
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
                          TXT
                        </code>
                        <CopyButton text="TXT" itemId={`type-${index}`} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        Record Value
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
                          {record.value}
                        </code>
                        <CopyButton
                          text={record.value}
                          itemId={`value-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoCheckDns}
                  onChange={(e) => setAutoCheckDns(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Auto-check DNS every 30 seconds
                </span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                onClick={checkDnsRecords}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <RefreshCw size={16} />
                Check DNS
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Start Over
              </button>
            </div>

            {verificationResults.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold text-gray-800 mb-3">
                  DNS Verification Results:
                </h4>
                <div className="space-y-2">
                  {verificationResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded border ${
                        result.verified
                          ? "bg-green-50 border-green-200 text-green-800"
                          : "bg-red-50 border-red-200 text-red-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.verified ? (
                          <CheckCircle size={16} />
                        ) : (
                          <Clock size={16} />
                        )}
                        <span className="font-mono text-sm">{result.name}</span>
                        <span className="text-xs">
                          {result.verified ? "Verified" : "Pending"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Verification Complete */}
        {step === 3 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 3: DNS Verified - Generate Certificates
            </h3>
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Success!</strong> All DNS records have been verified.
                You can now generate your SSL certificates.
              </p>
            </div>
            <button
              onClick={generateCertificates}
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading
                ? "Generating Certificates..."
                : "Generate SSL Certificates"}
            </button>
          </div>
        )}

        {/* Step 4: Certificates */}
        {step === 4 && certificates && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 4: Your SSL Certificates for {domain}
            </h3>
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Certificates Generated Successfully!</strong> Download
                your certificate files below.
              </p>
            </div>

            <div className="grid gap-4">
              {[
                {
                  key: "fullchain" as keyof CertificateFiles,
                  title: "Full Chain Certificate",
                  desc: "Use for most hosting control panels",
                },
                {
                  key: "privkey" as keyof CertificateFiles,
                  title: "Private Key",
                  desc: "Keep this secure and private",
                },
                {
                  key: "cert" as keyof CertificateFiles,
                  title: "Certificate Only",
                  desc: "Your domain certificate",
                },
                {
                  key: "chain" as keyof CertificateFiles,
                  title: "Certificate Chain",
                  desc: "Intermediate certificates",
                },
              ].map(({ key, title, desc }) =>
                certificates && certificates[key] ? (
                  <div
                    key={key}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h5 className="font-semibold text-gray-800">{title}</h5>
                        <p className="text-xs text-gray-600">{desc}</p>
                      </div>
                      <div className="flex gap-2">
                        <CopyButton
                          text={certificates[key] || ""}
                          itemId={key}
                        />
                        <button
                          onClick={() =>
                            downloadAsTextFile(
                              certificates[key] || "",
                              `${domain}_${key}.txt`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
                        >
                          <Download size={12} />
                          Download
                        </button>
                      </div>
                    </div>
                    <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap break-all">
                        {(certificates[key] || "").substring(0, 200)}...
                      </pre>
                    </div>
                  </div>
                ) : null
              )}
            </div>

            <button
              onClick={resetForm}
              className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Generate Another Certificate
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SSLGenerator;
// "use client";
// import React, { useState, useEffect } from "react";
// import {
//   Copy,
//   Check,
//   Shield,
//   Globe,
//   Mail,
//   AlertCircle,
//   Terminal,
//   Download,
//   FileText,
//   Key,
//   Award,
//   Server,
//   Settings,
//   RefreshCw,
//   CheckCircle,
//   Clock,
//   ExternalLink,
// } from "lucide-react";

// const SSLGenerator = () => {
//   const [domain, setDomain] = useState("");
//   const [email, setEmail] = useState("");
//   const [includeWildcard, setIncludeWildcard] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [step, setStep] = useState(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
//   const [dnsRecords, setDnsRecords] = useState([]);
//   const [verificationResults, setVerificationResults] = useState([]);
//   const [certificates, setCertificates] = useState(null);
//   const [copiedItems, setCopiedItems] = useState(new Set());
//   const [autoCheckDns, setAutoCheckDns] = useState(false);

//   // Auto-check DNS every 30 seconds when enabled
//   useEffect(() => {
//     let interval;
//     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
//       interval = setInterval(checkDnsRecords, 30000);
//     }
//     return () => clearInterval(interval);
//   }, [autoCheckDns, dnsRecords, step]);

//   const copyToClipboard = async (text, itemId) => {
//     try {
//       const textContent =
//         typeof text === "string" ? text.trim() : String(text).trim();
//       await navigator.clipboard.writeText(textContent);
//       setCopiedItems((prev) => new Set([...prev, itemId]));
//       setTimeout(() => {
//         setCopiedItems((prev) => {
//           const newSet = new Set(prev);
//           newSet.delete(itemId);
//           return newSet;
//         });
//       }, 2000);
//     } catch (err) {
//       console.error("Copy failed:", err);
//     }
//   };

//   const downloadAsTextFile = (content, filename) => {
//     const textContent =
//       typeof content === "string" ? content.trim() : String(content).trim();
//     const txtFilename = filename.endsWith(".txt")
//       ? filename
//       : `${filename}.txt`;
//     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = txtFilename;
//     document.body.appendChild(a);
//     a.click();
//     window.URL.revokeObjectURL(url);
//     document.body.removeChild(a);
//   };

//   const generateDnsChallenge = async () => {
//     if (!domain || !email) return;

//     setLoading(true);
//     try {
//       const response = await fetch("/api/generate-dns-challenge", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ domain, email, includeWildcard }),
//       });

//       const data = await response.json();
//       if (data.success) {
//         setDnsRecords(data.dnsRecords);
//         setStep(2);
//       } else {
//         alert(`Error: ${data.error}`);
//       }
//     } catch (error) {
//       alert("Failed to generate DNS challenge. Please try again.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const checkDnsRecords = async () => {
//     if (dnsRecords.length === 0) return;

//     try {
//       const response = await fetch("/api/verify-dns", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ records: dnsRecords }),
//       });

//       const data = await response.json();
//       setVerificationResults(data.records || []);

//       if (data.verified) {
//         setStep(3);
//         setAutoCheckDns(false);
//       }
//     } catch (error) {
//       console.error("DNS check failed:", error);
//     }
//   };

//   const generateCertificates = async () => {
//     setLoading(true);
//     try {
//       const response = await fetch("/api/generate-certificates", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ domain, dnsRecords }),
//       });

//       const data = await response.json();
//       if (data.success) {
//         setCertificates(data.certificates);
//         setStep(4);
//       } else {
//         alert(`Error: ${data.error}`);
//       }
//     } catch (error) {
//       alert("Failed to generate certificates. Please try again.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const resetForm = () => {
//     setStep(1);
//     setDomain("");
//     setEmail("");
//     setIncludeWildcard(false);
//     setDnsRecords([]);
//     setVerificationResults([]);
//     setCertificates(null);
//     setAutoCheckDns(false);
//   };

//   const CopyButton = ({ text, itemId, className = "" }) => {
//     const isCopied = copiedItems.has(itemId);
//     return (
//       <button
//         onClick={() => copyToClipboard(text, itemId)}
//         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
//           isCopied
//             ? "bg-green-100 text-green-700 border border-green-300"
//             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
//         }`}
//         title={isCopied ? "Copied!" : "Copy to clipboard"}
//       >
//         {isCopied ? <Check size={14} /> : <Copy size={14} />}
//         {isCopied ? "Copied!" : "Copy"}
//       </button>
//     );
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <div className="flex items-center justify-center gap-2 mb-4">
//             <Shield className="w-8 h-8 text-blue-600" />
//             <h1 className="text-3xl font-bold text-gray-900">
//               SSL Certificate Generator
//             </h1>
//           </div>
//           <p className="text-gray-600">
//             Generate free SSL certificates for any domain with step-by-step
//             guidance
//           </p>
//         </div>

//         {/* Progress Steps */}
//         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
//           <div className="flex items-center justify-between mb-6">
//             {[
//               { num: 1, title: "Domain Info", icon: Globe },
//               { num: 2, title: "DNS Records", icon: Settings },
//               { num: 3, title: "Verification", icon: CheckCircle },
//               { num: 4, title: "Certificates", icon: Award },
//             ].map(({ num, title, icon: Icon }) => (
//               <div key={num} className="flex items-center">
//                 <div
//                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
//                     step >= num
//                       ? "bg-blue-600 text-white"
//                       : "bg-gray-200 text-gray-500"
//                   }`}
//                 >
//                   {step > num ? <Check size={20} /> : <Icon size={20} />}
//                 </div>
//                 <span className="ml-2 text-sm font-medium text-gray-700">
//                   {title}
//                 </span>
//                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
//               </div>
//             ))}
//           </div>
//         </div>

//         {/* Step 1: Domain Information */}
//         {step === 1 && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 1: Enter Domain Information
//             </h3>
//             <div className="space-y-4">
//               <div className="grid md:grid-cols-2 gap-4">
//                 <div>
//                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
//                     <Globe size={16} />
//                     Domain Name
//                   </label>
//                   <input
//                     type="text"
//                     value={domain}
//                     onChange={(e) => setDomain(e.target.value)}
//                     placeholder="example.com"
//                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
//                     required
//                   />
//                 </div>
//                 <div>
//                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
//                     <Mail size={16} />
//                     Email Address
//                   </label>
//                   <input
//                     type="email"
//                     value={email}
//                     onChange={(e) => setEmail(e.target.value)}
//                     placeholder="admin@example.com"
//                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
//                     required
//                   />
//                 </div>
//               </div>
//               <div className="flex items-center gap-2">
//                 <input
//                   type="checkbox"
//                   id="wildcard"
//                   checked={includeWildcard}
//                   onChange={(e) => setIncludeWildcard(e.target.checked)}
//                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
//                 />
//                 <label htmlFor="wildcard" className="text-sm text-gray-700">
//                   Include wildcard certificate (*.{domain || "example.com"})
//                 </label>
//               </div>
//               <button
//                 onClick={generateDnsChallenge}
//                 disabled={loading || !domain || !email}
//                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//               >
//                 {loading
//                   ? "Generating DNS Challenge..."
//                   : "Generate DNS Challenge"}
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Step 2: DNS Records */}
//         {step === 2 && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 2: Add DNS TXT Records for {domain}
//             </h3>
//             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//               <p className="text-sm text-yellow-800">
//                 <strong>Instructions:</strong> Add these DNS TXT records to your
//                 domain's DNS settings, then click "Check DNS" to verify they're
//                 propagated.
//               </p>
//             </div>

//             <div className="space-y-4 mb-6">
//               {dnsRecords.map((record, index) => (
//                 <div
//                   key={index}
//                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
//                 >
//                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
//                     <div>
//                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                         Record Name
//                       </label>
//                       <div className="flex items-center gap-2 mt-1">
//                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
//                           {record.name}
//                         </code>
//                         <CopyButton
//                           text={record.name}
//                           itemId={`name-${index}`}
//                         />
//                       </div>
//                     </div>
//                     <div>
//                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                         Record Type
//                       </label>
//                       <div className="flex items-center gap-2 mt-1">
//                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
//                           TXT
//                         </code>
//                         <CopyButton text="TXT" itemId={`type-${index}`} />
//                       </div>
//                     </div>
//                     <div>
//                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                         Record Value
//                       </label>
//                       <div className="flex items-center gap-2 mt-1">
//                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
//                           {record.value}
//                         </code>
//                         <CopyButton
//                           text={record.value}
//                           itemId={`value-${index}`}
//                         />
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>

//             <div className="flex items-center gap-4 mb-4">
//               <label className="flex items-center gap-2">
//                 <input
//                   type="checkbox"
//                   checked={autoCheckDns}
//                   onChange={(e) => setAutoCheckDns(e.target.checked)}
//                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
//                 />
//                 <span className="text-sm text-gray-700">
//                   Auto-check DNS every 30 seconds
//                 </span>
//               </label>
//             </div>

//             <div className="flex gap-4">
//               <button
//                 onClick={checkDnsRecords}
//                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
//               >
//                 <RefreshCw size={16} />
//                 Check DNS
//               </button>
//               <button
//                 onClick={resetForm}
//                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
//               >
//                 Start Over
//               </button>
//             </div>

//             {verificationResults.length > 0 && (
//               <div className="mt-6">
//                 <h4 className="font-semibold text-gray-800 mb-3">
//                   DNS Verification Results:
//                 </h4>
//                 <div className="space-y-2">
//                   {verificationResults.map((result, index) => (
//                     <div
//                       key={index}
//                       className={`p-3 rounded border ${
//                         result.verified
//                           ? "bg-green-50 border-green-200 text-green-800"
//                           : "bg-red-50 border-red-200 text-red-800"
//                       }`}
//                     >
//                       <div className="flex items-center gap-2">
//                         {result.verified ? (
//                           <CheckCircle size={16} />
//                         ) : (
//                           <Clock size={16} />
//                         )}
//                         <span className="font-mono text-sm">{result.name}</span>
//                         <span className="text-xs">
//                           {result.verified ? "Verified" : "Pending"}
//                         </span>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}
//           </div>
//         )}

//         {/* Step 3: Verification Complete */}
//         {step === 3 && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 3: DNS Verified - Generate Certificates
//             </h3>
//             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
//               <p className="text-sm text-green-800">
//                 <strong>Success!</strong> All DNS records have been verified.
//                 You can now generate your SSL certificates.
//               </p>
//             </div>
//             <button
//               onClick={generateCertificates}
//               disabled={loading}
//               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//             >
//               {loading
//                 ? "Generating Certificates..."
//                 : "Generate SSL Certificates"}
//             </button>
//           </div>
//         )}

//         {/* Step 4: Certificates */}
//         {step === 4 && certificates && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 4: Your SSL Certificates for {domain}
//             </h3>
//             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
//               <p className="text-sm text-green-800">
//                 <strong>Certificates Generated Successfully!</strong> Download
//                 your certificate files below.
//               </p>
//             </div>

//             <div className="grid gap-4">
//               {[
//                 {
//                   key: "fullchain",
//                   title: "Full Chain Certificate",
//                   desc: "Use for most hosting control panels",
//                 },
//                 {
//                   key: "privkey",
//                   title: "Private Key",
//                   desc: "Keep this secure and private",
//                 },
//                 {
//                   key: "cert",
//                   title: "Certificate Only",
//                   desc: "Your domain certificate",
//                 },
//                 {
//                   key: "chain",
//                   title: "Certificate Chain",
//                   desc: "Intermediate certificates",
//                 },
//               ].map(
//                 ({ key, title, desc }) =>
//                   certificates[key] && (
//                     <div
//                       key={key}
//                       className="border border-gray-200 rounded-lg p-4"
//                     >
//                       <div className="flex items-center justify-between mb-2">
//                         <div>
//                           <h5 className="font-semibold text-gray-800">
//                             {title}
//                           </h5>
//                           <p className="text-xs text-gray-600">{desc}</p>
//                         </div>
//                         <div className="flex gap-2">
//                           <CopyButton text={certificates[key]} itemId={key} />
//                           <button
//                             onClick={() =>
//                               downloadAsTextFile(
//                                 certificates[key],
//                                 `${domain}_${key}.txt`
//                               )
//                             }
//                             className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
//                           >
//                             <Download size={12} />
//                             Download
//                           </button>
//                         </div>
//                       </div>
//                       <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
//                         <pre className="whitespace-pre-wrap break-all">
//                           {certificates[key].substring(0, 200)}...
//                         </pre>
//                       </div>
//                     </div>
//                   )
//               )}
//             </div>

//             <button
//               onClick={resetForm}
//               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
//             >
//               Generate Another Certificate
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default SSLGenerator;

//frontend interface to manage copy verifying ,downloading or coping each cert generated
// "use client";
// import React, { useState } from "react";
// import {
//   Copy,
//   Check,
//   Shield,
//   Globe,
//   Mail,
//   AlertCircle,
//   Terminal,
//   Download,
//   FileText,
//   Key,
//   Award,
//   Server,
//   Settings,
// } from "lucide-react";

// const SSLGenerator = () => {
//   const [domain, setDomain] = useState("");
//   const [email, setEmail] = useState("");
//   const [includeWildcard, setIncludeWildcard] = useState(false);
//   const [generationType, setGenerationType] = useState("manual"); // 'manual' or 'automatic'
//   const [loading, setLoading] = useState(false);
//   const [result, setResult] = useState(null);
//   const [copiedItems, setCopiedItems] = useState(new Set());

//   const copyToClipboard = async (text, itemId) => {
//     try {
//       // Ensure text is properly formatted
//       const textContent =
//         typeof text === "string" ? text.trim() : String(text).trim();

//       await navigator.clipboard.writeText(textContent);
//       setCopiedItems((prev) => new Set([...prev, itemId]));
//       setTimeout(() => {
//         setCopiedItems((prev) => {
//           const newSet = new Set(prev);
//           newSet.delete(itemId);
//           return newSet;
//         });
//       }, 2000);
//     } catch (err) {
//       // Fallback for browsers that don't support clipboard API
//       const textContent =
//         typeof text === "string" ? text.trim() : String(text).trim();
//       const textArea = document.createElement("textarea");
//       textArea.value = textContent;
//       document.body.appendChild(textArea);
//       textArea.select();
//       document.execCommand("copy");
//       document.body.removeChild(textArea);

//       setCopiedItems((prev) => new Set([...prev, itemId]));
//       setTimeout(() => {
//         setCopiedItems((prev) => {
//           const newSet = new Set(prev);
//           newSet.delete(itemId);
//           return newSet;
//         });
//       }, 2000);
//     }
//   };

//   const downloadAsTextFile = (content, filename) => {
//     // Ensure content is properly formatted text
//     const textContent =
//       typeof content === "string" ? content.trim() : String(content).trim();

//     // Ensure filename has .txt extension
//     const txtFilename = filename.endsWith(".txt")
//       ? filename
//       : `${filename}.txt`;

//     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = txtFilename;
//     document.body.appendChild(a);
//     a.click();
//     window.URL.revokeObjectURL(url);
//     document.body.removeChild(a);
//   };

//   const downloadAllCertificates = () => {
//     if (!result?.certificateFiles) return;

//     const files = [
//       {
//         content: result.certificateFiles.fullchain,
//         name: `${domain}_fullchain.txt`,
//       },
//       {
//         content: result.certificateFiles.privkey,
//         name: `${domain}_privkey.txt`,
//       },
//       {
//         content: result.certificateFiles.cert,
//         name: `${domain}_cert.txt`,
//       },
//       {
//         content: result.certificateFiles.chain,
//         name: `${domain}_chain.txt`,
//       },
//     ];

//     files.forEach((file) => {
//       if (file.content && file.content.trim().length > 0) {
//         downloadAsTextFile(file.content, file.name);
//       }
//     });
//   };

//   const CopyButton = ({ text, itemId, className = "" }) => {
//     const isCopied = copiedItems.has(itemId);

//     return (
//       <button
//         onClick={() => copyToClipboard(text, itemId)}
//         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
//           isCopied
//             ? "bg-green-100 text-green-700 border border-green-300"
//             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
//         }`}
//         title={isCopied ? "Copied!" : "Copy to clipboard"}
//       >
//         {isCopied ? <Check size={14} /> : <Copy size={14} />}
//         {isCopied ? "Copied!" : "Copy"}
//       </button>
//     );
//   };

//   const CertificateFileCard = ({
//     title,
//     content,
//     filename,
//     icon: Icon,
//     description,
//     usage,
//   }) => {
//     // Ensure content is properly formatted for display and download
//     const formattedContent = content ? content.trim() : "";
//     const txtFilename = filename.endsWith(".txt")
//       ? filename
//       : `${filename}.txt`;

//     return (
//       <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
//         <div className="flex items-center justify-between mb-3">
//           <div className="flex items-center gap-2">
//             <Icon size={18} className="text-blue-600" />
//             <h5 className="font-semibold text-gray-800">{title}</h5>
//           </div>
//           <div className="flex gap-2">
//             <CopyButton
//               text={formattedContent}
//               itemId={`cert-${filename}`}
//               className="text-xs"
//             />
//             <button
//               onClick={() => downloadAsTextFile(formattedContent, txtFilename)}
//               className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
//               title="Download as text file"
//             >
//               <Download size={12} />
//               Download
//             </button>
//           </div>
//         </div>

//         <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
//           <p className="text-xs text-blue-800">
//             <strong>Usage:</strong> {usage}
//           </p>
//         </div>

//         <p className="text-xs text-gray-600 mb-3">{description}</p>

//         <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
//           <pre className="whitespace-pre-wrap break-all">
//             {formattedContent}
//           </pre>
//         </div>
//       </div>
//     );
//   };

//   const generateCertificate = async () => {
//     if (!domain || !email) return;

//     setLoading(true);
//     setResult(null);

//     try {
//       const endpoint =
//         generationType === "automatic"
//           ? "/api/generate-cert-automatic"
//           : "/api/generate-cert";
//       const response = await fetch(endpoint, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           domain,
//           email,
//           includeWildcard,
//         }),
//       });

//       const data = await response.json();
//       setResult(data);
//     } catch (error) {
//       setResult({
//         success: false,
//         error:
//           "Failed to connect to server. Please check your connection and try again.",
//       });
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <div className="flex items-center justify-center gap-2 mb-4">
//             <Shield className="w-8 h-8 text-blue-600" />
//             <h1 className="text-3xl font-bold text-gray-900">
//               Universal SSL Certificate Generator
//             </h1>
//           </div>
//           <p className="text-gray-600">
//             Generate free SSL certificates for any domain and hosting provider -
//             cPanel, Plesk, VPS, or dedicated servers by Tony
//           </p>
//         </div>

//         {/* Form */}
//         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
//           <div className="space-y-4">
//             {/* Generation Type Selection */}
//             <div>
//               <label className="text-sm font-medium text-gray-700 mb-3 block">
//                 Certificate Generation Method
//               </label>
//               <div className="grid md:grid-cols-2 gap-4">
//                 <div
//                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
//                     generationType === "manual"
//                       ? "border-blue-500 bg-blue-50"
//                       : "border-gray-200 hover:border-gray-300"
//                   }`}
//                   onClick={() => setGenerationType("manual")}
//                 >
//                   <div className="flex items-center gap-2 mb-2">
//                     <Settings size={20} className="text-blue-600" />
//                     <h4 className="font-medium">Manual DNS Verification</h4>
//                   </div>
//                   <p className="text-sm text-gray-600">
//                     Get DNS verification instructions for any domain. You add
//                     TXT records manually and run commands on your server.
//                   </p>
//                   <div className="mt-2 text-xs text-gray-500">
//                     Best for: Self-managed servers, VPS, dedicated servers, any
//                     domain
//                   </div>
//                 </div>

//                 <div
//                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
//                     generationType === "automatic"
//                       ? "border-blue-500 bg-blue-50"
//                       : "border-gray-200 hover:border-gray-300"
//                   }`}
//                   onClick={() => setGenerationType("automatic")}
//                 >
//                   <div className="flex items-center gap-2 mb-2">
//                     <Server size={20} className="text-blue-600" />
//                     <h4 className="font-medium">Automatic Generation</h4>
//                   </div>
//                   <p className="text-sm text-gray-600">
//                     Generate certificates automatically with downloadable files
//                     for any hosting control panel.
//                   </p>
//                   <div className="mt-2 text-xs text-gray-500">
//                     Best for: cPanel, Plesk, shared hosting, any domain
//                   </div>
//                 </div>
//               </div>
//             </div>

//             <div className="grid md:grid-cols-2 gap-4">
//               <div>
//                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
//                   <Globe size={16} />
//                   Domain Name
//                 </label>
//                 <input
//                   type="text"
//                   value={domain}
//                   onChange={(e) => setDomain(e.target.value)}
//                   placeholder="example.com"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   required
//                 />
//                 <p className="text-xs text-gray-500 mt-1">
//                   Any domain: yourdomain.com, company.org, etc.
//                 </p>
//               </div>

//               <div>
//                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
//                   <Mail size={16} />
//                   Email Address
//                 </label>
//                 <input
//                   type="email"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="admin@example.com"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   required
//                 />
//                 <p className="text-xs text-gray-500 mt-1">
//                   Required for Let's Encrypt registration
//                 </p>
//               </div>
//             </div>

//             <div className="flex items-center gap-2">
//               <input
//                 type="checkbox"
//                 id="wildcard"
//                 checked={includeWildcard}
//                 onChange={(e) => setIncludeWildcard(e.target.checked)}
//                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
//               />
//               <label htmlFor="wildcard" className="text-sm text-gray-700">
//                 Include wildcard certificate (*.{domain || "example.com"})
//               </label>
//             </div>

//             <button
//               onClick={generateCertificate}
//               disabled={loading || !domain || !email}
//               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//             >
//               {loading
//                 ? "Processing..."
//                 : `Generate SSL Certificate for ${domain || "Your Domain"} (${
//                     generationType === "manual" ? "Manual" : "Automatic"
//                   })`}
//             </button>
//           </div>
//         </div>

//         {/* Results */}
//         {result && (
//           <div className="space-y-6">
//             {result.success ? (
//               <>
//                 {/* DNS Records for Verification */}
//                 {result.dnsRecords && result.dnsRecords.length > 0 && (
//                   <div className="bg-white rounded-lg shadow-lg p-6">
//                     <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
//                       <Globe size={20} />
//                       DNS Verification Required for {domain}
//                     </h4>

//                     <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//                       <p className="text-sm text-yellow-800">
//                         <strong>Step 1:</strong> Add these DNS TXT records to{" "}
//                         {domain}'s DNS settings
//                       </p>
//                     </div>

//                     <div className="space-y-4">
//                       {result.dnsRecords.map((record, index) => (
//                         <div
//                           key={index}
//                           className="border border-gray-200 rounded-lg p-4 bg-gray-50"
//                         >
//                           <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
//                             <div>
//                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                                 Record Name
//                               </label>
//                               <div className="flex items-center gap-2 mt-1">
//                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
//                                   {record.name}
//                                 </code>
//                                 <CopyButton
//                                   text={record.name}
//                                   itemId={`name-${index}`}
//                                 />
//                               </div>
//                             </div>

//                             <div>
//                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                                 Record Type
//                               </label>
//                               <div className="flex items-center gap-2 mt-1">
//                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
//                                   {record.type}
//                                 </code>
//                                 <CopyButton
//                                   text={record.type}
//                                   itemId={`type-${index}`}
//                                 />
//                               </div>
//                             </div>

//                             <div>
//                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                                 Record Value
//                               </label>
//                               <div className="flex items-center gap-2 mt-1">
//                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
//                                   {record.value}
//                                 </code>
//                                 <CopyButton
//                                   text={record.value}
//                                   itemId={`value-${index}`}
//                                 />
//                               </div>
//                             </div>
//                           </div>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}

//                 {/* Server Command */}
//                 {result.serverCommand && (
//                   <div className="bg-white rounded-lg shadow-lg p-6">
//                     <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
//                       <Terminal size={20} />
//                       Server Command for {domain}
//                     </h4>
//                     <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm relative">
//                       <pre className="whitespace-pre-wrap break-all">
//                         {result.serverCommand}
//                       </pre>
//                       <div className="absolute top-2 right-2">
//                         <CopyButton
//                           text={result.serverCommand}
//                           itemId="server-command"
//                           className="bg-gray-800 hover:bg-gray-700 text-gray-300"
//                         />
//                       </div>
//                     </div>
//                     <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
//                       <p className="text-sm text-blue-800">
//                         <strong>Step 2:</strong> After adding DNS records for{" "}
//                         {domain}, run this command on your server and press
//                         Enter when prompted.
//                       </p>
//                     </div>
//                   </div>
//                 )}

//                 {/* Certificate Files (for automatic generation) */}
//                 {result.certificateFiles && (
//                   <div className="bg-white rounded-lg shadow-lg p-6">
//                     <div className="flex items-center justify-between mb-4">
//                       <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
//                         <Award size={20} />
//                         Generated SSL Certificates for {domain}
//                       </h4>
//                       {(result.certificateFiles.fullchain ||
//                         result.certificateFiles.privkey ||
//                         result.certificateFiles.cert ||
//                         result.certificateFiles.chain) && (
//                         <button
//                           onClick={downloadAllCertificates}
//                           className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
//                         >
//                           <Download size={16} />
//                           Download All as Text Files
//                         </button>
//                       )}
//                     </div>

//                     {/* Show warning if no certificate files */}
//                     {!result.certificateFiles.fullchain &&
//                       !result.certificateFiles.privkey &&
//                       !result.certificateFiles.cert &&
//                       !result.certificateFiles.chain && (
//                         <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//                           <p className="text-sm text-yellow-800">
//                             <strong>Notice:</strong> Certificate files are not
//                             available for {domain}. This may be because:
//                           </p>
//                           <ul className="text-sm text-yellow-700 mt-2 list-disc list-inside">
//                             <li>DNS records need to be added first</li>
//                             <li>Certificate generation is still in progress</li>
//                             <li>
//                               There was an issue with the generation process
//                             </li>
//                           </ul>
//                         </div>
//                       )}

//                     <div className="grid gap-6">
//                       {/* Full Chain Certificate */}
//                       {result.certificateFiles.fullchain && (
//                         <CertificateFileCard
//                           title="Certificate (CRT) - Full Chain"
//                           content={result.certificateFiles.fullchain}
//                           filename={`${domain}_fullchain.txt`}
//                           icon={Award}
//                           description="Complete certificate chain including intermediates. This is the most commonly used certificate file."
//                           usage="Use for Nginx, most hosting control panels, and cPanel Certificate (CRT) field"
//                         />
//                       )}

//                       {/* Private Key */}
//                       {result.certificateFiles.privkey && (
//                         <CertificateFileCard
//                           title="Private Key (KEY)"
//                           content={result.certificateFiles.privkey}
//                           filename={`${domain}_privkey.txt`}
//                           icon={Key}
//                           description="Your private key - KEEP THIS SECURE! Never share this file publicly or commit to version control."
//                           usage="Use for server configurations and hosting control panel Private Key (KEY) field"
//                         />
//                       )}

//                       {/* Certificate Only */}
//                       {result.certificateFiles.cert && (
//                         <CertificateFileCard
//                           title="Certificate Only"
//                           content={result.certificateFiles.cert}
//                           filename={`${domain}_cert.txt`}
//                           icon={FileText}
//                           description="Your domain certificate without intermediate certificates."
//                           usage="Use for Apache SSLCertificateFile or when intermediate certificates are handled separately"
//                         />
//                       )}

//                       {/* Certificate Chain */}
//                       {result.certificateFiles.chain && (
//                         <CertificateFileCard
//                           title="Certificate Authority Bundle (CABUNDLE)"
//                           content={result.certificateFiles.chain}
//                           filename={`${domain}_chain.txt`}
//                           icon={FileText}
//                           description="Intermediate certificates that establish the certificate chain of trust."
//                           usage="Use for hosting control panels CABUNDLE field or Apache SSLCertificateChainFile"
//                         />
//                       )}
//                     </div>

//                     {/* Installation Instructions */}
//                     <div className="mt-6 grid md:grid-cols-2 gap-4">
//                       {/* Hosting Control Panel */}
//                       <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
//                         <h5 className="font-semibold text-blue-900 mb-3">
//                           For Hosting Control Panels (cPanel, Plesk)
//                         </h5>
//                         <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
//                           <li>Go to SSL/TLS → Install and Manage SSL</li>
//                           <li>
//                             Select your domain: <strong>{domain}</strong>
//                           </li>
//                           <li>
//                             Upload or paste <strong>Full Chain</strong>{" "}
//                             certificate in CRT field
//                           </li>
//                           <li>
//                             Upload or paste <strong>Private Key</strong> in KEY
//                             field
//                           </li>
//                           <li>
//                             Upload or paste <strong>CA Bundle</strong> in
//                             CABUNDLE field
//                           </li>
//                           <li>Click "Install Certificate" to activate SSL</li>
//                         </ol>
//                       </div>

//                       {/* Server Configuration */}
//                       <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
//                         <h5 className="font-semibold text-green-900 mb-3">
//                           For Direct Server Installation ({domain})
//                         </h5>
//                         <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
//                           <li>Upload certificate files to your server</li>
//                           <li>
//                             Configure web server (Nginx/Apache) for {domain}
//                           </li>
//                           <li>
//                             Use <strong>Full Chain</strong> for ssl_certificate
//                           </li>
//                           <li>
//                             Use <strong>Private Key</strong> for
//                             ssl_certificate_key
//                           </li>
//                           <li>Restart web server and test SSL</li>
//                         </ol>
//                       </div>
//                     </div>
//                   </div>
//                 )}

//                 {/* Instructions */}
//                 {result.instructions && (
//                   <div className="bg-white rounded-lg shadow-lg p-6">
//                     <h4 className="text-lg font-bold text-gray-800 mb-4">
//                       Next Steps for {domain}
//                     </h4>
//                     <div className="space-y-3">
//                       {result.instructions.map((instruction, index) => (
//                         <div
//                           key={index}
//                           className="flex items-start gap-3 p-3 bg-gray-50 rounded border"
//                         >
//                           <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-sm font-bold rounded-full flex items-center justify-center">
//                             {index + 1}
//                           </div>
//                           <p className="text-sm text-gray-700">{instruction}</p>
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}

//                 {/* Message */}
//                 <div className="bg-white rounded-lg shadow-lg p-6">
//                   <div className="flex items-center gap-2 text-green-700 mb-2">
//                     <Check className="w-5 h-5" />
//                     <h3 className="font-semibold">Success</h3>
//                   </div>
//                   <p className="text-green-800">{result.message}</p>
//                   {result.note && (
//                     <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
//                       <p className="text-sm text-yellow-800">
//                         <strong>Note:</strong> {result.note}
//                       </p>
//                     </div>
//                   )}
//                   {result.isTestCertificate && (
//                     <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
//                       <p className="text-sm text-blue-800">
//                         <strong>Development Mode:</strong> These are test
//                         certificates for {domain}. For production SSL, ensure
//                         DNS records are properly configured and try again.
//                       </p>
//                     </div>
//                   )}
//                 </div>
//               </>
//             ) : (
//               <div className="bg-white rounded-lg shadow-lg p-6">
//                 <div className="flex items-center gap-2 text-red-700 mb-4">
//                   <AlertCircle className="w-5 h-5" />
//                   <h3 className="text-lg font-semibold">
//                     Certificate Generation Failed for {domain}
//                   </h3>
//                 </div>
//                 <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
//                   <strong>Error:</strong> {result.error}
//                 </div>
//                 {result.troubleshooting && (
//                   <div className="mt-4">
//                     <h5 className="font-medium text-gray-800 mb-2">
//                       Troubleshooting Tips for {domain}:
//                     </h5>
//                     <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
//                       {result.troubleshooting.map((tip, index) => (
//                         <li key={index}>{tip}</li>
//                       ))}
//                     </ul>
//                   </div>
//                 )}
//               </div>
//             )}

//             <button
//               onClick={() => {
//                 setResult(null);
//                 setDomain("");
//                 setEmail("");
//                 setIncludeWildcard(false);
//               }}
//               className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
//             >
//               Generate Another Certificate
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default SSLGenerator;

// // "use client";
// // import React, { useState } from "react";
// // import {
// //   Copy,
// //   Check,
// //   Shield,
// //   Globe,
// //   Mail,
// //   AlertCircle,
// //   Terminal,
// //   Download,
// //   FileText,
// //   Key,
// //   Award,
// //   Upload,
// //   Server,
// //   Settings,
// // } from "lucide-react";

// // const SSLGenerator = () => {
// //   const [domain, setDomain] = useState("");
// //   const [email, setEmail] = useState("");
// //   const [includeWildcard, setIncludeWildcard] = useState(false);
// //   const [generationType, setGenerationType] = useState("manual"); // 'manual' or 'automatic'
// //   const [loading, setLoading] = useState(false);
// //   const [result, setResult] = useState(null);
// //   const [copiedItems, setCopiedItems] = useState(new Set());

// //   const copyToClipboard = async (text, itemId) => {
// //     try {
// //       await navigator.clipboard.writeText(text);
// //       setCopiedItems((prev) => new Set([...prev, itemId]));
// //       setTimeout(() => {
// //         setCopiedItems((prev) => {
// //           const newSet = new Set(prev);
// //           newSet.delete(itemId);
// //           return newSet;
// //         });
// //       }, 2000);
// //     } catch (err) {
// //       const textArea = document.createElement("textarea");
// //       textArea.value = text;
// //       document.body.appendChild(textArea);
// //       textArea.select();
// //       document.execCommand("copy");
// //       document.body.removeChild(textArea);

// //       setCopiedItems((prev) => new Set([...prev, itemId]));
// //       setTimeout(() => {
// //         setCopiedItems((prev) => {
// //           const newSet = new Set(prev);
// //           newSet.delete(itemId);
// //           return newSet;
// //         });
// //       }, 2000);
// //     }
// //   };

// //   const downloadAsTextFile = (content, filename) => {
// //     const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
// //     const url = window.URL.createObjectURL(blob);
// //     const a = document.createElement("a");
// //     a.href = url;
// //     a.download = filename;
// //     document.body.appendChild(a);
// //     a.click();
// //     window.URL.revokeObjectURL(url);
// //     document.body.removeChild(a);
// //   };

// //   const downloadAllCertificates = () => {
// //     if (!result?.certificateFiles) return;

// //     const files = [
// //       {
// //         content: result.certificateFiles.fullchain,
// //         name: `${domain}_fullchain.txt`,
// //       },
// //       {
// //         content: result.certificateFiles.privkey,
// //         name: `${domain}_privkey.txt`,
// //       },
// //       { content: result.certificateFiles.cert, name: `${domain}_cert.txt` },
// //       { content: result.certificateFiles.chain, name: `${domain}_chain.txt` },
// //     ];

// //     files.forEach((file) => {
// //       if (file.content) {
// //         downloadAsTextFile(file.content, file.name);
// //       }
// //     });
// //   };

// //   const CopyButton = ({ text, itemId, className = "" }) => {
// //     const isCopied = copiedItems.has(itemId);

// //     return (
// //       <button
// //         onClick={() => copyToClipboard(text, itemId)}
// //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// //           isCopied
// //             ? "bg-green-100 text-green-700 border border-green-300"
// //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// //         }`}
// //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// //       >
// //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// //         {isCopied ? "Copied!" : "Copy"}
// //       </button>
// //     );
// //   };

// //   const CertificateFileCard = ({
// //     title,
// //     content,
// //     filename,
// //     icon: Icon,
// //     description,
// //     usage,
// //   }) => (
// //     <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
// //       <div className="flex items-center justify-between mb-3">
// //         <div className="flex items-center gap-2">
// //           <Icon size={18} className="text-blue-600" />
// //           <h5 className="font-semibold text-gray-800">{title}</h5>
// //         </div>
// //         <div className="flex gap-2">
// //           <CopyButton
// //             text={content}
// //             itemId={`cert-${filename}`}
// //             className="text-xs"
// //           />
// //           <button
// //             onClick={() => downloadAsTextFile(content, filename)}
// //             className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// //             title="Download as text file"
// //           >
// //             <Download size={12} />
// //             Download
// //           </button>
// //         </div>
// //       </div>

// //       <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
// //         <p className="text-xs text-blue-800">
// //           <strong>Usage:</strong> {usage}
// //         </p>
// //       </div>

// //       <p className="text-xs text-gray-600 mb-3">{description}</p>

// //       <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
// //         <pre className="whitespace-pre-wrap break-all">{content}</pre>
// //       </div>
// //     </div>
// //   );

// //   const generateCertificate = async () => {
// //     if (!domain || !email) return;

// //     setLoading(true);
// //     setResult(null);

// //     try {
// //       const endpoint =
// //         generationType === "automatic"
// //           ? "/api/generate-cert-automatic"
// //           : "/api/generate-cert";
// //       const response = await fetch(endpoint, {
// //         method: "POST",
// //         headers: {
// //           "Content-Type": "application/json",
// //         },
// //         body: JSON.stringify({
// //           domain,
// //           email,
// //           includeWildcard,
// //         }),
// //       });

// //       const data = await response.json();
// //       setResult(data);
// //     } catch (error) {
// //       setResult({
// //         success: false,
// //         error:
// //           "Failed to connect to server. Please check your connection and try again.",
// //       });
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   return (
// //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// //       <div className="max-w-6xl mx-auto">
// //         {/* Header */}
// //         <div className="text-center mb-8">
// //           <div className="flex items-center justify-center gap-2 mb-4">
// //             <Shield className="w-8 h-8 text-blue-600" />
// //             <h1 className="text-3xl font-bold text-gray-900">
// //               Let's Encrypt SSL Generator
// //             </h1>
// //           </div>
// //           <p className="text-gray-600">
// //             Generate free SSL certificates for any server, hosting provider, or
// //             control panel
// //           </p>
// //         </div>

// //         {/* Form */}
// //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// //           <div className="space-y-4">
// //             {/* Generation Type Selection */}
// //             <div>
// //               <label className="text-sm font-medium text-gray-700 mb-3 block">
// //                 Certificate Generation Method
// //               </label>
// //               <div className="grid md:grid-cols-2 gap-4">
// //                 <div
// //                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
// //                     generationType === "manual"
// //                       ? "border-blue-500 bg-blue-50"
// //                       : "border-gray-200 hover:border-gray-300"
// //                   }`}
// //                   onClick={() => setGenerationType("manual")}
// //                 >
// //                   <div className="flex items-center gap-2 mb-2">
// //                     <Settings size={20} className="text-blue-600" />
// //                     <h4 className="font-medium">Manual DNS Verification</h4>
// //                   </div>
// //                   <p className="text-sm text-gray-600">
// //                     Get DNS verification instructions. You add TXT records
// //                     manually and run commands on your server.
// //                   </p>
// //                   <div className="mt-2 text-xs text-gray-500">
// //                     Best for: Self-managed servers, VPS, dedicated servers
// //                   </div>
// //                 </div>

// //                 <div
// //                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
// //                     generationType === "automatic"
// //                       ? "border-blue-500 bg-blue-50"
// //                       : "border-gray-200 hover:border-gray-300"
// //                   }`}
// //                   onClick={() => setGenerationType("automatic")}
// //                 >
// //                   <div className="flex items-center gap-2 mb-2">
// //                     <Server size={20} className="text-blue-600" />
// //                     <h4 className="font-medium">Automatic Generation</h4>
// //                   </div>
// //                   <p className="text-sm text-gray-600">
// //                     Generate certificates automatically with downloadable files
// //                     for hosting control panels.
// //                   </p>
// //                   <div className="mt-2 text-xs text-gray-500">
// //                     Best for: cPanel, Plesk, shared hosting, manual installation
// //                   </div>
// //                 </div>
// //               </div>
// //             </div>

// //             <div className="grid md:grid-cols-2 gap-4">
// //               <div>
// //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// //                   <Globe size={16} />
// //                   Domain Name
// //                 </label>
// //                 <input
// //                   type="text"
// //                   value={domain}
// //                   onChange={(e) => setDomain(e.target.value)}
// //                   placeholder="example.com"
// //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                   required
// //                 />
// //               </div>

// //               <div>
// //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// //                   <Mail size={16} />
// //                   Email Address
// //                 </label>
// //                 <input
// //                   type="email"
// //                   value={email}
// //                   onChange={(e) => setEmail(e.target.value)}
// //                   placeholder="admin@example.com"
// //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                   required
// //                 />
// //               </div>
// //             </div>

// //             <div className="flex items-center gap-2">
// //               <input
// //                 type="checkbox"
// //                 id="wildcard"
// //                 checked={includeWildcard}
// //                 onChange={(e) => setIncludeWildcard(e.target.checked)}
// //                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// //               />
// //               <label htmlFor="wildcard" className="text-sm text-gray-700">
// //                 Include wildcard certificate (*.{domain || "example.com"})
// //               </label>
// //             </div>

// //             <button
// //               onClick={generateCertificate}
// //               disabled={loading || !domain || !email}
// //               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// //             >
// //               {loading
// //                 ? "Processing..."
// //                 : `Generate SSL Certificate (${
// //                     generationType === "manual" ? "Manual" : "Automatic"
// //                   })`}
// //             </button>
// //           </div>
// //         </div>

// //         {/* Results */}
// //         {result && (
// //           <div className="space-y-6">
// //             {result.success ? (
// //               <>
// //                 {/* DNS Records for Verification */}
// //                 {result.dnsRecords && result.dnsRecords.length > 0 && (
// //                   <div className="bg-white rounded-lg shadow-lg p-6">
// //                     <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
// //                       <Globe size={20} />
// //                       DNS Verification Required
// //                     </h4>

// //                     <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// //                       <p className="text-sm text-yellow-800">
// //                         <strong>Step 1:</strong> Add these DNS TXT records to
// //                         your domain's DNS settings
// //                       </p>
// //                     </div>

// //                     <div className="space-y-4">
// //                       {result.dnsRecords.map((record, index) => (
// //                         <div
// //                           key={index}
// //                           className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// //                         >
// //                           <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// //                             <div>
// //                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// //                                 Record Name
// //                               </label>
// //                               <div className="flex items-center gap-2 mt-1">
// //                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// //                                   {record.name}
// //                                 </code>
// //                                 <CopyButton
// //                                   text={record.name}
// //                                   itemId={`name-${index}`}
// //                                 />
// //                               </div>
// //                             </div>

// //                             <div>
// //                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// //                                 Record Type
// //                               </label>
// //                               <div className="flex items-center gap-2 mt-1">
// //                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// //                                   {record.type}
// //                                 </code>
// //                                 <CopyButton
// //                                   text={record.type}
// //                                   itemId={`type-${index}`}
// //                                 />
// //                               </div>
// //                             </div>

// //                             <div>
// //                               <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// //                                 Record Value
// //                               </label>
// //                               <div className="flex items-center gap-2 mt-1">
// //                                 <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// //                                   {record.value}
// //                                 </code>
// //                                 <CopyButton
// //                                   text={record.value}
// //                                   itemId={`value-${index}`}
// //                                 />
// //                               </div>
// //                             </div>
// //                           </div>
// //                         </div>
// //                       ))}
// //                     </div>
// //                   </div>
// //                 )}

// //                 {/* Server Command */}
// //                 {result.serverCommand && (
// //                   <div className="bg-white rounded-lg shadow-lg p-6">
// //                     <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
// //                       <Terminal size={20} />
// //                       Server Command
// //                     </h4>
// //                     <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm relative">
// //                       <pre className="whitespace-pre-wrap break-all">
// //                         {result.serverCommand}
// //                       </pre>
// //                       <div className="absolute top-2 right-2">
// //                         <CopyButton
// //                           text={result.serverCommand}
// //                           itemId="server-command"
// //                           className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// //                         />
// //                       </div>
// //                     </div>
// //                     <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
// //                       <p className="text-sm text-blue-800">
// //                         <strong>Step 2:</strong> After adding DNS records, run
// //                         this command on your server and press Enter when
// //                         prompted.
// //                       </p>
// //                     </div>
// //                   </div>
// //                 )}

// //                 {/* Certificate Files (for automatic generation) */}
// //                 {result.certificateFiles && (
// //                   <div className="bg-white rounded-lg shadow-lg p-6">
// //                     <div className="flex items-center justify-between mb-4">
// //                       <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
// //                         <Award size={20} />
// //                         Generated SSL Certificates
// //                       </h4>
// //                       <button
// //                         onClick={downloadAllCertificates}
// //                         className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
// //                       >
// //                         <Download size={16} />
// //                         Download All as Text Files
// //                       </button>
// //                     </div>

// //                     <div className="grid gap-6">
// //                       {/* Full Chain Certificate */}
// //                       {result.certificateFiles.fullchain && (
// //                         <CertificateFileCard
// //                           title="Certificate (CRT) - Full Chain"
// //                           content={result.certificateFiles.fullchain}
// //                           filename={`${domain}_fullchain.txt`}
// //                           icon={Award}
// //                           description="Complete certificate chain including intermediates. This is the most commonly used certificate file."
// //                           usage="Use for Nginx, most hosting control panels, and cPanel Certificate (CRT) field"
// //                         />
// //                       )}

// //                       {/* Private Key */}
// //                       {result.certificateFiles.privkey && (
// //                         <CertificateFileCard
// //                           title="Private Key (KEY)"
// //                           content={result.certificateFiles.privkey}
// //                           filename={`${domain}_privkey.txt`}
// //                           icon={Key}
// //                           description="Your private key - KEEP THIS SECURE! Never share this file publicly or commit to version control."
// //                           usage="Use for server configurations and hosting control panel Private Key (KEY) field"
// //                         />
// //                       )}

// //                       {/* Certificate Only */}
// //                       {result.certificateFiles.cert && (
// //                         <CertificateFileCard
// //                           title="Certificate Only"
// //                           content={result.certificateFiles.cert}
// //                           filename={`${domain}_cert.txt`}
// //                           icon={FileText}
// //                           description="Your domain certificate without intermediate certificates."
// //                           usage="Use for Apache SSLCertificateFile or when intermediate certificates are handled separately"
// //                         />
// //                       )}

// //                       {/* Certificate Chain */}
// //                       {result.certificateFiles.chain && (
// //                         <CertificateFileCard
// //                           title="Certificate Authority Bundle (CABUNDLE)"
// //                           content={result.certificateFiles.chain}
// //                           filename={`${domain}_chain.txt`}
// //                           icon={FileText}
// //                           description="Intermediate certificates that establish the certificate chain of trust."
// //                           usage="Use for hosting control panels CABUNDLE field or Apache SSLCertificateChainFile"
// //                         />
// //                       )}
// //                     </div>

// //                     {/* Installation Instructions */}
// //                     <div className="mt-6 grid md:grid-cols-2 gap-4">
// //                       {/* Hosting Control Panel */}
// //                       <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
// //                         <h5 className="font-semibold text-blue-900 mb-3">
// //                           For Hosting Control Panels (cPanel, Plesk)
// //                         </h5>
// //                         <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
// //                           <li>Go to SSL/TLS section</li>
// //                           <li>
// //                             Upload or paste <strong>Full Chain</strong>{" "}
// //                             certificate
// //                           </li>
// //                           <li>
// //                             Upload or paste <strong>Private Key</strong>
// //                           </li>
// //                           <li>
// //                             Upload or paste <strong>CA Bundle</strong> if
// //                             required
// //                           </li>
// //                           <li>Install and activate</li>
// //                         </ol>
// //                       </div>

// //                       {/* Server Configuration */}
// //                       <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
// //                         <h5 className="font-semibold text-green-900 mb-3">
// //                           For Direct Server Installation
// //                         </h5>
// //                         <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
// //                           <li>Upload certificate files to your server</li>
// //                           <li>Configure web server (Nginx/Apache)</li>
// //                           <li>
// //                             Use <strong>Full Chain</strong> for ssl_certificate
// //                           </li>
// //                           <li>
// //                             Use <strong>Private Key</strong> for
// //                             ssl_certificate_key
// //                           </li>
// //                           <li>Restart web server</li>
// //                         </ol>
// //                       </div>
// //                     </div>
// //                   </div>
// //                 )}

// //                 {/* Instructions */}
// //                 {result.instructions && (
// //                   <div className="bg-white rounded-lg shadow-lg p-6">
// //                     <h4 className="text-lg font-bold text-gray-800 mb-4">
// //                       Next Steps
// //                     </h4>
// //                     <div className="space-y-3">
// //                       {result.instructions.map((instruction, index) => (
// //                         <div
// //                           key={index}
// //                           className="flex items-start gap-3 p-3 bg-gray-50 rounded border"
// //                         >
// //                           <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-sm font-bold rounded-full flex items-center justify-center">
// //                             {index + 1}
// //                           </div>
// //                           <p className="text-sm text-gray-700">{instruction}</p>
// //                         </div>
// //                       ))}
// //                     </div>
// //                   </div>
// //                 )}

// //                 {/* Message */}
// //                 <div className="bg-white rounded-lg shadow-lg p-6">
// //                   <div className="flex items-center gap-2 text-green-700 mb-2">
// //                     <Check className="w-5 h-5" />
// //                     <h3 className="font-semibold">Success</h3>
// //                   </div>
// //                   <p className="text-green-800">{result.message}</p>
// //                   {result.note && (
// //                     <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
// //                       <p className="text-sm text-yellow-800">
// //                         <strong>Note:</strong> {result.note}
// //                       </p>
// //                     </div>
// //                   )}
// //                 </div>
// //               </>
// //             ) : (
// //               <div className="bg-white rounded-lg shadow-lg p-6">
// //                 <div className="flex items-center gap-2 text-red-700 mb-4">
// //                   <AlertCircle className="w-5 h-5" />
// //                   <h3 className="text-lg font-semibold">
// //                     Certificate Generation Failed
// //                   </h3>
// //                 </div>
// //                 <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
// //                   <strong>Error:</strong> {result.error}
// //                 </div>
// //                 {result.troubleshooting && (
// //                   <div className="mt-4">
// //                     <h5 className="font-medium text-gray-800 mb-2">
// //                       Troubleshooting Tips:
// //                     </h5>
// //                     <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
// //                       {result.troubleshooting.map((tip, index) => (
// //                         <li key={index}>{tip}</li>
// //                       ))}
// //                     </ul>
// //                   </div>
// //                 )}
// //               </div>
// //             )}

// //             <button
// //               onClick={() => {
// //                 setResult(null);
// //                 setDomain("");
// //                 setEmail("");
// //                 setIncludeWildcard(false);
// //               }}
// //               className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// //             >
// //               Generate Another Certificate
// //             </button>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // };

// // export default SSLGenerator;

// // "use client";
// // import React, { useState } from "react";
// // import {
// //   Copy,
// //   Check,
// //   Shield,
// //   Globe,
// //   Mail,
// //   AlertCircle,
// //   Terminal,
// //   Download,
// //   FileText,
// //   Key,
// //   Award,
// //   Upload,
// // } from "lucide-react";

// // const SSLGenerator = () => {
// //   const [domain, setDomain] = useState("");
// //   const [email, setEmail] = useState("");
// //   const [includeWildcard, setIncludeWildcard] = useState(false);
// //   const [loading, setLoading] = useState(false);
// //   const [result, setResult] = useState(null);
// //   const [copiedItems, setCopiedItems] = useState(new Set());

// //   const copyToClipboard = async (text, itemId) => {
// //     try {
// //       await navigator.clipboard.writeText(text);
// //       setCopiedItems((prev) => new Set([...prev, itemId]));
// //       setTimeout(() => {
// //         setCopiedItems((prev) => {
// //           const newSet = new Set(prev);
// //           newSet.delete(itemId);
// //           return newSet;
// //         });
// //       }, 2000);
// //     } catch (err) {
// //       // Fallback for older browsers
// //       const textArea = document.createElement("textarea");
// //       textArea.value = text;
// //       document.body.appendChild(textArea);
// //       textArea.select();
// //       document.execCommand("copy");
// //       document.body.removeChild(textArea);

// //       setCopiedItems((prev) => new Set([...prev, itemId]));
// //       setTimeout(() => {
// //         setCopiedItems((prev) => {
// //           const newSet = new Set(prev);
// //           newSet.delete(itemId);
// //           return newSet;
// //         });
// //       }, 2000);
// //     }
// //   };

// //   const downloadFile = (content, filename) => {
// //     const blob = new Blob([content], { type: "text/plain" });
// //     const url = window.URL.createObjectURL(blob);
// //     const a = document.createElement("a");
// //     a.href = url;
// //     a.download = filename;
// //     document.body.appendChild(a);
// //     a.click();
// //     window.URL.revokeObjectURL(url);
// //     document.body.removeChild(a);
// //   };

// //   const downloadAllCertificates = () => {
// //     if (!result?.certificateFiles) return;

// //     const files = [
// //       {
// //         content: result.certificateFiles.fullchain,
// //         name: `${domain}_fullchain.pem`,
// //       },
// //       {
// //         content: result.certificateFiles.privkey,
// //         name: `${domain}_privkey.pem`,
// //       },
// //       { content: result.certificateFiles.cert, name: `${domain}_cert.pem` },
// //       { content: result.certificateFiles.chain, name: `${domain}_chain.pem` },
// //     ];

// //     files.forEach((file) => {
// //       if (file.content) {
// //         downloadFile(file.content, file.name);
// //       }
// //     });
// //   };

// //   const CopyButton = ({ text, itemId, className = "" }) => {
// //     const isCopied = copiedItems.has(itemId);

// //     return (
// //       <button
// //         onClick={() => copyToClipboard(text, itemId)}
// //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// //           isCopied
// //             ? "bg-green-100 text-green-700 border border-green-300"
// //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// //         }`}
// //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// //       >
// //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// //         {isCopied ? "Copied!" : "Copy"}
// //       </button>
// //     );
// //   };

// //   const CertificateFileCard = ({
// //     title,
// //     content,
// //     filename,
// //     icon: Icon,
// //     description,
// //     cpanelField,
// //   }) => (
// //     <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
// //       <div className="flex items-center justify-between mb-3">
// //         <div className="flex items-center gap-2">
// //           <Icon size={18} className="text-blue-600" />
// //           <h5 className="font-semibold text-gray-800">{title}</h5>
// //         </div>
// //         <div className="flex gap-2">
// //           <CopyButton
// //             text={content}
// //             itemId={`cert-${filename}`}
// //             className="text-xs"
// //           />
// //           <button
// //             onClick={() => downloadFile(content, filename)}
// //             className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// //             title="Download file"
// //           >
// //             <Download size={12} />
// //             Download
// //           </button>
// //         </div>
// //       </div>

// //       {cpanelField && (
// //         <div className="mb-2 p-2 bg-blue-50 rounded border border-blue-200">
// //           <p className="text-xs text-blue-800">
// //             <strong>For cPanel/Hosting:</strong> Copy this content and paste
// //             into the "<strong>{cpanelField}</strong>" field
// //           </p>
// //         </div>
// //       )}

// //       <p className="text-xs text-gray-600 mb-3">{description}</p>

// //       <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
// //         <pre className="whitespace-pre-wrap break-all">{content}</pre>
// //       </div>
// //     </div>
// //   );

// //   const generateCertificate = async () => {
// //     if (!domain || !email) return;

// //     setLoading(true);
// //     setResult(null);

// //     try {
// //       // For demo purposes, let's simulate certificate generation
// //       // In production, this would call your actual API

// //       // Simulate API delay
// //       await new Promise((resolve) => setTimeout(resolve, 3000));

// //       // Mock certificate data (replace with actual API call)
// //       const mockCertificateFiles = {
// //         fullchain: `-----BEGIN CERTIFICATE-----
// // MIIE...example certificate content for ${domain}...
// // This would be the actual full chain certificate from Let's Encrypt
// // -----END CERTIFICATE-----
// // -----BEGIN CERTIFICATE-----
// // MIIE...intermediate certificate...
// // -----END CERTIFICATE-----`,

// //         privkey: `-----BEGIN PRIVATE KEY-----
// // MIIE...example private key for ${domain}...
// // This would be the actual private key - KEEP THIS SECURE!
// // -----END PRIVATE KEY-----`,

// //         cert: `-----BEGIN CERTIFICATE-----
// // MIIE...example certificate only for ${domain}...
// // This would be just the domain certificate without intermediates
// // -----END CERTIFICATE-----`,

// //         chain: `-----BEGIN CERTIFICATE-----
// // MIIE...example intermediate certificates...
// // This would be the certificate chain/bundle
// // -----END CERTIFICATE-----`,
// //       };

// //       setResult({
// //         success: true,
// //         message: "SSL certificates generated successfully!",
// //         certificateFiles: mockCertificateFiles,
// //         domain,
// //         expiryDate: new Date(
// //           Date.now() + 90 * 24 * 60 * 60 * 1000
// //         ).toLocaleDateString(),
// //         serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} -d ${domain}${
// //           includeWildcard ? ` -d *.${domain}` : ""
// //         } --agree-tos`,
// //       });
// //     } catch (error) {
// //       setResult({
// //         success: false,
// //         error: "Failed to generate certificates. Please try again.",
// //       });
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   return (
// //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// //       <div className="max-w-6xl mx-auto">
// //         {/* Header */}
// //         <div className="text-center mb-8">
// //           <div className="flex items-center justify-center gap-2 mb-4">
// //             <Shield className="w-8 h-8 text-blue-600" />
// //             <h1 className="text-3xl font-bold text-gray-900">
// //               Let's Encrypt SSL Generator
// //             </h1>
// //           </div>
// //           <p className="text-gray-600">
// //             Generate free SSL certificates for cPanel, Plesk, and other hosting
// //             control panels
// //           </p>
// //         </div>

// //         {/* Form */}
// //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// //           <div className="space-y-4">
// //             <div className="grid md:grid-cols-2 gap-4">
// //               <div>
// //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// //                   <Globe size={16} />
// //                   Domain Name
// //                 </label>
// //                 <input
// //                   type="text"
// //                   value={domain}
// //                   onChange={(e) => setDomain(e.target.value)}
// //                   placeholder="example.com"
// //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                   required
// //                 />
// //               </div>

// //               <div>
// //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// //                   <Mail size={16} />
// //                   Email Address
// //                 </label>
// //                 <input
// //                   type="email"
// //                   value={email}
// //                   onChange={(e) => setEmail(e.target.value)}
// //                   placeholder="admin@example.com"
// //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// //                   required
// //                 />
// //               </div>
// //             </div>

// //             <div className="flex items-center gap-2">
// //               <input
// //                 type="checkbox"
// //                 id="wildcard"
// //                 checked={includeWildcard}
// //                 onChange={(e) => setIncludeWildcard(e.target.checked)}
// //                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// //               />
// //               <label htmlFor="wildcard" className="text-sm text-gray-700">
// //                 Include wildcard certificate (*.{domain || "example.com"})
// //               </label>
// //             </div>

// //             <button
// //               onClick={generateCertificate}
// //               disabled={loading}
// //               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// //             >
// //               {loading
// //                 ? "Generating Certificates..."
// //                 : "Generate SSL Certificates"}
// //             </button>
// //           </div>
// //         </div>

// //         {/* Results */}
// //         {result && (
// //           <div className="space-y-6">
// //             {result.success ? (
// //               <>
// //                 {/* Success Header */}
// //                 <div className="bg-white rounded-lg shadow-lg p-6">
// //                   <div className="flex items-center gap-2 mb-4">
// //                     <div className="flex items-center gap-2 text-green-700">
// //                       <Check className="w-6 h-6" />
// //                       <h3 className="text-xl font-bold">
// //                         SSL Certificates Generated Successfully!
// //                       </h3>
// //                     </div>
// //                   </div>

// //                   <div className="grid md:grid-cols-3 gap-4 mb-4">
// //                     <div className="bg-green-50 p-3 rounded border border-green-200">
// //                       <p className="text-sm text-green-700">
// //                         <strong>Domain:</strong> {result.domain}
// //                       </p>
// //                     </div>
// //                     <div className="bg-blue-50 p-3 rounded border border-blue-200">
// //                       <p className="text-sm text-blue-700">
// //                         <strong>Expires:</strong> {result.expiryDate}
// //                       </p>
// //                     </div>
// //                     <div className="bg-purple-50 p-3 rounded border border-purple-200">
// //                       <button
// //                         onClick={downloadAllCertificates}
// //                         className="flex items-center gap-2 text-sm text-purple-700 font-medium"
// //                       >
// //                         <Download size={16} />
// //                         Download All Files
// //                       </button>
// //                     </div>
// //                   </div>
// //                 </div>

// //                 {/* Certificate Files */}
// //                 <div className="bg-white rounded-lg shadow-lg p-6">
// //                   <h4 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
// //                     <Upload size={20} />
// //                     Certificate Files for Hosting Control Panels
// //                   </h4>

// //                   <div className="grid gap-6">
// //                     {/* Full Chain Certificate - Most Important */}
// //                     {result.certificateFiles.fullchain && (
// //                       <CertificateFileCard
// //                         title="Certificate (CRT)"
// //                         content={result.certificateFiles.fullchain}
// //                         filename={`${domain}_fullchain.pem`}
// //                         icon={Award}
// //                         description="This is your main certificate file. Use this for most hosting providers and control panels."
// //                         cpanelField="Certificate: (CRT)"
// //                       />
// //                     )}

// //                     {/* Private Key */}
// //                     {result.certificateFiles.privkey && (
// //                       <CertificateFileCard
// //                         title="Private Key (KEY)"
// //                         content={result.certificateFiles.privkey}
// //                         filename={`${domain}_privkey.pem`}
// //                         icon={Key}
// //                         description="Your private key - KEEP THIS SECURE! Never share this file publicly."
// //                         cpanelField="Private Key (KEY)"
// //                       />
// //                     )}

// //                     {/* Certificate Bundle/Chain */}
// //                     {result.certificateFiles.chain && (
// //                       <CertificateFileCard
// //                         title="Certificate Authority Bundle (CABUNDLE)"
// //                         content={result.certificateFiles.chain}
// //                         filename={`${domain}_chain.pem`}
// //                         icon={FileText}
// //                         description="Intermediate certificates. Some hosting providers require this in a separate field."
// //                         cpanelField="Certificate Authority Bundle: (CABUNDLE)"
// //                       />
// //                     )}
// //                   </div>

// //                   {/* Installation Instructions */}
// //                   <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// //                     <h5 className="font-semibold text-blue-900 mb-3">
// //                       cPanel/Hosting Installation Steps:
// //                     </h5>
// //                     <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
// //                       <li>
// //                         Go to your hosting control panel (cPanel, Plesk, etc.)
// //                       </li>
// //                       <li>Find "SSL/TLS" or "SSL Certificates" section</li>
// //                       <li>
// //                         Choose "Install SSL Certificate" or "Upload Certificate"
// //                       </li>
// //                       <li>
// //                         Copy and paste the <strong>Certificate (CRT)</strong>{" "}
// //                         content above
// //                       </li>
// //                       <li>
// //                         Copy and paste the <strong>Private Key (KEY)</strong>{" "}
// //                         content above
// //                       </li>
// //                       <li>
// //                         If there's a CA Bundle field, copy the{" "}
// //                         <strong>CABUNDLE</strong> content
// //                       </li>
// //                       <li>Click "Install Certificate" or "Save"</li>
// //                       <li>Your site should now be accessible via HTTPS!</li>
// //                     </ol>
// //                   </div>

// //                   {/* Renewal Reminder */}
// //                   <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// //                     <h5 className="font-semibold text-yellow-900 mb-2">
// //                       ⚠️ Important: Certificate Renewal
// //                     </h5>
// //                     <p className="text-sm text-yellow-800">
// //                       Let's Encrypt certificates expire every 90 days. Set a
// //                       calendar reminder to regenerate your certificates before{" "}
// //                       <strong>{result.expiryDate}</strong> or set up
// //                       auto-renewal on your server.
// //                     </p>
// //                   </div>
// //                 </div>
// //               </>
// //             ) : (
// //               <div className="bg-white rounded-lg shadow-lg p-6">
// //                 <div className="flex items-center gap-2 text-red-700 mb-4">
// //                   <AlertCircle className="w-5 h-5" />
// //                   <h3 className="text-lg font-semibold">
// //                     Certificate Generation Failed
// //                   </h3>
// //                 </div>
// //                 <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
// //                   <strong>Error:</strong> {result.error}
// //                 </div>
// //               </div>
// //             )}

// //             <button
// //               onClick={() => {
// //                 setResult(null);
// //                 setDomain("");
// //                 setEmail("");
// //                 setIncludeWildcard(false);
// //               }}
// //               className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// //             >
// //               Generate Another Certificate
// //             </button>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // };

// // export default SSLGenerator;

// // // "use client";
// // // import React, { useState } from "react";
// // // import {
// // //   Copy,
// // //   Check,
// // //   Shield,
// // //   Globe,
// // //   Mail,
// // //   AlertCircle,
// // //   Terminal,
// // //   Download,
// // //   FileText,
// // //   Key,
// // //   Award,
// // // } from "lucide-react";

// // // const SSLGenerator = () => {
// // //   const [domain, setDomain] = useState("");
// // //   const [email, setEmail] = useState("");
// // //   const [includeWildcard, setIncludeWildcard] = useState(false);
// // //   const [generationType, setGenerationType] = useState("instructions"); // 'instructions' or 'download'
// // //   const [loading, setLoading] = useState(false);
// // //   const [result, setResult] = useState(null);
// // //   const [copiedItems, setCopiedItems] = useState(new Set());

// // //   const copyToClipboard = async (text, itemId) => {
// // //     try {
// // //       await navigator.clipboard.writeText(text);
// // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // //       setTimeout(() => {
// // //         setCopiedItems((prev) => {
// // //           const newSet = new Set(prev);
// // //           newSet.delete(itemId);
// // //           return newSet;
// // //         });
// // //       }, 2000);
// // //     } catch (err) {
// // //       // Fallback for older browsers
// // //       const textArea = document.createElement("textarea");
// // //       textArea.value = text;
// // //       document.body.appendChild(textArea);
// // //       textArea.select();
// // //       document.execCommand("copy");
// // //       document.body.removeChild(textArea);

// // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // //       setTimeout(() => {
// // //         setCopiedItems((prev) => {
// // //           const newSet = new Set(prev);
// // //           newSet.delete(itemId);
// // //           return newSet;
// // //         });
// // //       }, 2000);
// // //     }
// // //   };

// // //   const downloadFile = (content, filename) => {
// // //     const blob = new Blob([content], { type: "text/plain" });
// // //     const url = window.URL.createObjectURL(blob);
// // //     const a = document.createElement("a");
// // //     a.href = url;
// // //     a.download = filename;
// // //     document.body.appendChild(a);
// // //     a.click();
// // //     window.URL.revokeObjectURL(url);
// // //     document.body.removeChild(a);
// // //   };

// // //   const CopyButton = ({ text, itemId, className = "" }) => {
// // //     const isCopied = copiedItems.has(itemId);

// // //     return (
// // //       <button
// // //         onClick={() => copyToClipboard(text, itemId)}
// // //         className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${className} ${
// // //           isCopied
// // //             ? "bg-green-100 text-green-700 border border-green-300"
// // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // //         }`}
// // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // //       >
// // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // //         {isCopied ? "Copied!" : "Copy"}
// // //       </button>
// // //     );
// // //   };

// // //   const CertificateFile = ({
// // //     title,
// // //     content,
// // //     filename,
// // //     icon: Icon,
// // //     description,
// // //   }) => (
// // //     <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
// // //       <div className="flex items-center justify-between mb-2">
// // //         <div className="flex items-center gap-2">
// // //           <Icon size={16} className="text-blue-600" />
// // //           <h5 className="font-medium text-gray-800">{title}</h5>
// // //         </div>
// // //         <div className="flex gap-2">
// // //           <CopyButton text={content} itemId={`cert-${filename}`} />
// // //           <button
// // //             onClick={() => downloadFile(content, filename)}
// // //             className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // //             title="Download file"
// // //           >
// // //             <Download size={14} />
// // //             Download
// // //           </button>
// // //         </div>
// // //       </div>
// // //       <p className="text-xs text-gray-600 mb-2">{description}</p>
// // //       <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-40 overflow-y-auto">
// // //         <pre>{content}</pre>
// // //       </div>
// // //     </div>
// // //   );

// // //   const generateCertificate = async () => {
// // //     if (!domain || !email) return;

// // //     setLoading(true);
// // //     setResult(null);

// // //     try {
// // //       const endpoint =
// // //         generationType === "download"
// // //           ? "/api/generate-cert-download"
// // //           : "/api/generate-cert";
// // //       const response = await fetch(endpoint, {
// // //         method: "POST",
// // //         headers: {
// // //           "Content-Type": "application/json",
// // //         },
// // //         body: JSON.stringify({
// // //           domain,
// // //           email,
// // //           includeWildcard,
// // //         }),
// // //       });

// // //       const data = await response.json();
// // //       setResult(data);
// // //     } catch (error) {
// // //       setResult({
// // //         success: false,
// // //         error: "Failed to connect to server",
// // //       });
// // //     } finally {
// // //       setLoading(false);
// // //     }
// // //   };

// // //   return (
// // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // //       <div className="max-w-6xl mx-auto">
// // //         {/* Header */}
// // //         <div className="text-center mb-8">
// // //           <div className="flex items-center justify-center gap-2 mb-4">
// // //             <Shield className="w-8 h-8 text-blue-600" />
// // //             <h1 className="text-3xl font-bold text-gray-900">
// // //               Let's Encrypt SSL Generator
// // //             </h1>
// // //           </div>
// // //           <p className="text-gray-600">
// // //             Generate free SSL certificates with automatic DNS verification
// // //           </p>
// // //         </div>

// // //         {/* Form */}
// // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // //           <div className="space-y-4">
// // //             {/* Generation Type Selection */}
// // //             <div>
// // //               <label className="text-sm font-medium text-gray-700 mb-3 block">
// // //                 Certificate Generation Method
// // //               </label>
// // //               <div className="grid md:grid-cols-2 gap-4">
// // //                 <div
// // //                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
// // //                     generationType === "instructions"
// // //                       ? "border-blue-500 bg-blue-50"
// // //                       : "border-gray-200 hover:border-gray-300"
// // //                   }`}
// // //                   onClick={() => setGenerationType("instructions")}
// // //                 >
// // //                   <div className="flex items-center gap-2 mb-2">
// // //                     <Terminal size={20} className="text-blue-600" />
// // //                     <h4 className="font-medium">Server Installation</h4>
// // //                   </div>
// // //                   <p className="text-sm text-gray-600">
// // //                     Get DNS verification steps and server commands. Certificate
// // //                     will be installed directly on your server.
// // //                   </p>
// // //                 </div>

// // //                 <div
// // //                   className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
// // //                     generationType === "download"
// // //                       ? "border-blue-500 bg-blue-50"
// // //                       : "border-gray-200 hover:border-gray-300"
// // //                   }`}
// // //                   onClick={() => setGenerationType("download")}
// // //                 >
// // //                   <div className="flex items-center gap-2 mb-2">
// // //                     <Download size={20} className="text-blue-600" />
// // //                     <h4 className="font-medium">Download Files</h4>
// // //                   </div>
// // //                   <p className="text-sm text-gray-600">
// // //                     Generate and download certificate files (.pem) for manual
// // //                     installation on any server.
// // //                   </p>
// // //                 </div>
// // //               </div>
// // //             </div>

// // //             <div className="grid md:grid-cols-2 gap-4">
// // //               <div>
// // //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // //                   <Globe size={16} />
// // //                   Domain Name
// // //                 </label>
// // //                 <input
// // //                   type="text"
// // //                   value={domain}
// // //                   onChange={(e) => setDomain(e.target.value)}
// // //                   placeholder="example.com"
// // //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                   required
// // //                 />
// // //               </div>

// // //               <div>
// // //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // //                   <Mail size={16} />
// // //                   Email Address
// // //                 </label>
// // //                 <input
// // //                   type="email"
// // //                   value={email}
// // //                   onChange={(e) => setEmail(e.target.value)}
// // //                   placeholder="admin@example.com"
// // //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                   required
// // //                 />
// // //               </div>
// // //             </div>

// // //             <div className="flex items-center gap-2">
// // //               <input
// // //                 type="checkbox"
// // //                 id="wildcard"
// // //                 checked={includeWildcard}
// // //                 onChange={(e) => setIncludeWildcard(e.target.checked)}
// // //                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // //               />
// // //               <label htmlFor="wildcard" className="text-sm text-gray-700">
// // //                 Include wildcard certificate (*.{domain || "example.com"})
// // //               </label>
// // //             </div>

// // //             <button
// // //               onClick={generateCertificate}
// // //               disabled={loading}
// // //               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // //             >
// // //               {loading ? "Processing..." : "Generate Certificate"}
// // //             </button>
// // //           </div>
// // //         </div>

// // //         {/* Results */}
// // //         {result && (
// // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // //             <div className="flex items-center gap-2 mb-4">
// // //               {result.success ? (
// // //                 <div className="flex items-center gap-2 text-green-700">
// // //                   <Check className="w-5 h-5" />
// // //                   <h3 className="text-lg font-semibold">Success!</h3>
// // //                 </div>
// // //               ) : (
// // //                 <div className="flex items-center gap-2 text-red-700">
// // //                   <AlertCircle className="w-5 h-5" />
// // //                   <h3 className="text-lg font-semibold">Certificate Status</h3>
// // //                 </div>
// // //               )}
// // //             </div>

// // //             {/* Certificate Files Display */}
// // //             {result.success && result.certificateFiles && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
// // //                   <Award size={20} />
// // //                   Generated Certificate Files
// // //                 </h4>

// // //                 <div className="grid gap-4">
// // //                   {result.certificateFiles.fullchain && (
// // //                     <CertificateFile
// // //                       title="Full Chain Certificate"
// // //                       content={result.certificateFiles.fullchain}
// // //                       filename={`${domain}_fullchain.pem`}
// // //                       icon={Award}
// // //                       description="Complete certificate chain - use this for most web servers (Nginx, Apache, etc.)"
// // //                     />
// // //                   )}

// // //                   {result.certificateFiles.privkey && (
// // //                     <CertificateFile
// // //                       title="Private Key"
// // //                       content={result.certificateFiles.privkey}
// // //                       filename={`${domain}_privkey.pem`}
// // //                       icon={Key}
// // //                       description="Private key - KEEP THIS SECURE! Never share this file."
// // //                     />
// // //                   )}

// // //                   {result.certificateFiles.cert && (
// // //                     <CertificateFile
// // //                       title="Certificate Only"
// // //                       content={result.certificateFiles.cert}
// // //                       filename={`${domain}_cert.pem`}
// // //                       icon={FileText}
// // //                       description="Your domain certificate only (without intermediate certificates)"
// // //                     />
// // //                   )}

// // //                   {result.certificateFiles.chain && (
// // //                     <CertificateFile
// // //                       title="Certificate Chain"
// // //                       content={result.certificateFiles.chain}
// // //                       filename={`${domain}_chain.pem`}
// // //                       icon={FileText}
// // //                       description="Intermediate certificates chain"
// // //                     />
// // //                   )}
// // //                 </div>

// // //                 <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // //                   <h5 className="font-medium text-blue-900 mb-2">
// // //                     Installation Instructions:
// // //                   </h5>
// // //                   <ul className="text-sm text-blue-800 space-y-1">
// // //                     <li>
// // //                       • Upload <code>fullchain.pem</code> and{" "}
// // //                       <code>privkey.pem</code> to your server
// // //                     </li>
// // //                     <li>• Configure your web server to use these files</li>
// // //                     <li>
// // //                       • Keep <code>privkey.pem</code> secure and never share it
// // //                       publicly
// // //                     </li>
// // //                     <li>
// // //                       • Certificates expire in 90 days - set up auto-renewal
// // //                     </li>
// // //                   </ul>
// // //                 </div>
// // //               </div>
// // //             )}

// // //             {/* DNS Records for Verification */}
// // //             {result.dnsRecords && result.dnsRecords.length > 0 && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-md font-semibold text-gray-800 mb-3">
// // //                   DNS Records to Add for Verification
// // //                 </h4>
// // //                 <div className="space-y-3">
// // //                   {result.dnsRecords.map((record, index) => (
// // //                     <div
// // //                       key={index}
// // //                       className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // //                     >
// // //                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Name
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // //                               {record.name}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.name}
// // //                               itemId={`name-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>

// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Type
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // //                               {record.type}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.type}
// // //                               itemId={`type-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>

// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Value
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // //                               {record.value}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.value}
// // //                               itemId={`value-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>
// // //                       </div>
// // //                     </div>
// // //                   ))}
// // //                 </div>
// // //               </div>
// // //             )}

// // //             {/* Server Command */}
// // //             {result.success && result.serverCommand && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-md font-semibold text-gray-800 mb-2 flex items-center gap-2">
// // //                   <Terminal size={16} />
// // //                   Server Command
// // //                 </h4>
// // //                 <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm relative">
// // //                   <code>{result.serverCommand}</code>
// // //                   <div className="absolute top-2 right-2">
// // //                     <CopyButton
// // //                       text={result.serverCommand}
// // //                       itemId="server-command"
// // //                       className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// // //                     />
// // //                   </div>
// // //                 </div>
// // //               </div>
// // //             )}

// // //             {result.message && (
// // //               <div
// // //                 className={`p-3 rounded-md ${
// // //                   result.success
// // //                     ? "bg-green-50 text-green-800"
// // //                     : "bg-red-50 text-red-800"
// // //                 }`}
// // //               >
// // //                 {result.message}
// // //               </div>
// // //             )}

// // //             {result.error && (
// // //               <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
// // //                 <strong>Error:</strong> {result.error}
// // //               </div>
// // //             )}

// // //             <button
// // //               onClick={() => {
// // //                 setResult(null);
// // //                 setDomain("");
// // //                 setEmail("");
// // //                 setIncludeWildcard(false);
// // //               }}
// // //               className="mt-4 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // //             >
// // //               Generate Another Certificate
// // //             </button>
// // //           </div>
// // //         )}
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default SSLGenerator;

// // // "use client";
// // // import React, { useState } from "react";
// // // import {
// // //   Copy,
// // //   Check,
// // //   Shield,
// // //   Globe,
// // //   Mail,
// // //   AlertCircle,
// // //   Terminal,
// // // } from "lucide-react";

// // // const SSLGenerator = () => {
// // //   const [domain, setDomain] = useState("");
// // //   const [email, setEmail] = useState("");
// // //   const [includeWildcard, setIncludeWildcard] = useState(false);
// // //   const [loading, setLoading] = useState(false);
// // //   const [result, setResult] = useState(null);
// // //   const [copiedItems, setCopiedItems] = useState(new Set());

// // //   const copyToClipboard = async (text, itemId) => {
// // //     try {
// // //       await navigator.clipboard.writeText(text);
// // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // //       setTimeout(() => {
// // //         setCopiedItems((prev) => {
// // //           const newSet = new Set(prev);
// // //           newSet.delete(itemId);
// // //           return newSet;
// // //         });
// // //       }, 2000);
// // //     } catch (err) {
// // //       // Fallback for older browsers
// // //       const textArea = document.createElement("textarea");
// // //       textArea.value = text;
// // //       document.body.appendChild(textArea);
// // //       textArea.select();
// // //       document.execCommand("copy");
// // //       document.body.removeChild(textArea);

// // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // //       setTimeout(() => {
// // //         setCopiedItems((prev) => {
// // //           const newSet = new Set(prev);
// // //           newSet.delete(itemId);
// // //           return newSet;
// // //         });
// // //       }, 2000);
// // //     }
// // //   };

// // //   const CopyButton = ({ text, itemId, className = "" }) => {
// // //     const isCopied = copiedItems.has(itemId);

// // //     return (
// // //       <button
// // //         onClick={() => copyToClipboard(text, itemId)}
// // //         className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${className} ${
// // //           isCopied
// // //             ? "bg-green-100 text-green-700 border border-green-300"
// // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // //         }`}
// // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // //       >
// // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // //         {isCopied ? "Copied!" : "Copy"}
// // //       </button>
// // //     );
// // //   };

// // //   const generateCertificate = async () => {
// // //     if (!domain || !email) return;

// // //     setLoading(true);
// // //     setResult(null);

// // //     try {
// // //       const response = await fetch("/api/generate-cert", {
// // //         method: "POST",
// // //         headers: {
// // //           "Content-Type": "application/json",
// // //         },
// // //         body: JSON.stringify({
// // //           domain,
// // //           email,
// // //           includeWildcard,
// // //         }),
// // //       });

// // //       const data = await response.json();
// // //       setResult(data);
// // //     } catch (error) {
// // //       setResult({
// // //         success: false,
// // //         error: "Failed to connect to server",
// // //       });
// // //     } finally {
// // //       setLoading(false);
// // //     }
// // //   };

// // //   return (
// // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // //       <div className="max-w-4xl mx-auto">
// // //         {/* Header */}
// // //         <div className="text-center mb-8">
// // //           <div className="flex items-center justify-center gap-2 mb-4">
// // //             <Shield className="w-8 h-8 text-blue-600" />
// // //             <h1 className="text-3xl font-bold text-gray-900">
// // //               Let's Encrypt SSL Generator
// // //             </h1>
// // //           </div>
// // //           <p className="text-gray-600">
// // //             Generate free SSL certificates with automatic DNS verification
// // //           </p>
// // //         </div>

// // //         {/* Form */}
// // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // //           <div className="space-y-4">
// // //             <div className="grid md:grid-cols-2 gap-4">
// // //               <div>
// // //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // //                   <Globe size={16} />
// // //                   Domain Name
// // //                 </label>
// // //                 <input
// // //                   type="domain"
// // //                   value={domain}
// // //                   autoComplete=""
// // //                   onChange={(e) => setDomain(e.target.value)}
// // //                   placeholder="example.com"
// // //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                   required
// // //                 />
// // //               </div>

// // //               <div>
// // //                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // //                   <Mail size={16} />
// // //                   Email Address
// // //                 </label>
// // //                 <input
// // //                   type="email"
// // //                   value={email}
// // //                   onChange={(e) => setEmail(e.target.value)}
// // //                   placeholder="admin@example.com"
// // //                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // //                   required
// // //                 />
// // //               </div>
// // //             </div>

// // //             <div className="flex items-center gap-2">
// // //               <input
// // //                 type="checkbox"
// // //                 id="wildcard"
// // //                 checked={includeWildcard}
// // //                 onChange={(e) => setIncludeWildcard(e.target.checked)}
// // //                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // //               />
// // //               <label htmlFor="wildcard" className="text-sm text-gray-700">
// // //                 Include wildcard certificate (*.{domain || "example.com"})
// // //               </label>
// // //             </div>

// // //             <button
// // //               onClick={generateCertificate}
// // //               disabled={loading}
// // //               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // //             >
// // //               {loading ? "Processing..." : "Generate Certificate"}
// // //             </button>
// // //           </div>
// // //         </div>

// // //         {/* Results */}
// // //         {result && (
// // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // //             <div className="flex items-center gap-2 mb-4">
// // //               {result.success ? (
// // //                 <div className="flex items-center gap-2 text-green-700">
// // //                   <Check className="w-5 h-5" />
// // //                   <h3 className="text-lg font-semibold">Success!</h3>
// // //                 </div>
// // //               ) : (
// // //                 <div className="flex items-center gap-2 text-red-700">
// // //                   <AlertCircle className="w-5 h-5" />
// // //                   <h3 className="text-lg font-semibold">Certificate Status</h3>
// // //                 </div>
// // //               )}
// // //             </div>

// // //             {result.success && result.serverCommand && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-md font-semibold text-gray-800 mb-2 flex items-center gap-2">
// // //                   <Terminal size={16} />
// // //                   Server Command
// // //                 </h4>
// // //                 <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm relative">
// // //                   <code>{result.serverCommand}</code>
// // //                   <div className="absolute top-2 right-2">
// // //                     <CopyButton
// // //                       text={result.serverCommand}
// // //                       itemId="server-command"
// // //                       className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// // //                     />
// // //                   </div>
// // //                 </div>
// // //                 <p className="text-sm text-gray-600 mt-2">
// // //                   Run this command on your server to start the certificate
// // //                   generation process.
// // //                 </p>
// // //               </div>
// // //             )}

// // //             {result.dnsRecords && result.dnsRecords.length > 0 && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-md font-semibold text-gray-800 mb-3">
// // //                   DNS Records to Add
// // //                 </h4>
// // //                 <div className="space-y-3">
// // //                   {result.dnsRecords.map((record, index) => (
// // //                     <div
// // //                       key={index}
// // //                       className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // //                     >
// // //                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Name
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // //                               {record.name}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.name}
// // //                               itemId={`name-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>

// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Type
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // //                               {record.type}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.type}
// // //                               itemId={`type-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>

// // //                         <div>
// // //                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // //                             Record Value
// // //                           </label>
// // //                           <div className="flex items-center gap-2 mt-1">
// // //                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // //                               {record.value}
// // //                             </code>
// // //                             <CopyButton
// // //                               text={record.value}
// // //                               itemId={`value-${index}`}
// // //                             />
// // //                           </div>
// // //                         </div>
// // //                       </div>

// // //                       <div className="mt-3 pt-3 border-t border-gray-200">
// // //                         <div className="flex items-center justify-between">
// // //                           <span className="text-sm text-gray-600">
// // //                             Domain:{" "}
// // //                             <code className="font-mono">{record.domain}</code>
// // //                           </span>
// // //                           <CopyButton
// // //                             text={`${record.name} TXT ${record.value}`}
// // //                             itemId={`full-record-${index}`}
// // //                             className="text-xs"
// // //                           />
// // //                         </div>
// // //                       </div>
// // //                     </div>
// // //                   ))}
// // //                 </div>
// // //               </div>
// // //             )}

// // //             {result.instructions && (
// // //               <div className="mb-6">
// // //                 <h4 className="text-md font-semibold text-gray-800 mb-3">
// // //                   Instructions
// // //                 </h4>
// // //                 {result.instructions.map((instruction, index) => (
// // //                   <div
// // //                     key={index}
// // //                     className="border border-blue-200 rounded-lg p-4 bg-blue-50 mb-3"
// // //                   >
// // //                     <h5 className="font-medium text-blue-900 mb-2">
// // //                       {instruction.domain}
// // //                     </h5>
// // //                     <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
// // //                       {instruction.steps.map((step, stepIndex) => (
// // //                         <li key={stepIndex}>{step}</li>
// // //                       ))}
// // //                     </ol>
// // //                   </div>
// // //                 ))}
// // //               </div>
// // //             )}

// // //             {result.message && (
// // //               <div
// // //                 className={`p-3 rounded-md ${
// // //                   result.success
// // //                     ? "bg-green-50 text-green-800"
// // //                     : "bg-red-50 text-red-800"
// // //                 }`}
// // //               >
// // //                 {result.message}
// // //               </div>
// // //             )}

// // //             {result.error && (
// // //               <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
// // //                 <strong>Error:</strong> {result.error}
// // //               </div>
// // //             )}

// // //             {result.note && (
// // //               <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md mt-3">
// // //                 <strong>Note:</strong> {result.note}
// // //               </div>
// // //             )}

// // //             <button
// // //               onClick={() => {
// // //                 setResult(null);
// // //                 setDomain("");
// // //                 setEmail("");
// // //                 setIncludeWildcard(false);
// // //               }}
// // //               className="mt-4 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // //             >
// // //               Generate Another Certificate
// // //             </button>
// // //           </div>
// // //         )}
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default SSLGenerator;

// // // "use client";

// // // import { useState, useEffect } from "react";
// // // import { motion, AnimatePresence } from "framer-motion";
// // // import {
// // //   Shield,
// // //   Globe,
// // //   CheckCircle,
// // //   AlertCircle,
// // //   Clock,
// // //   Copy,
// // //   RefreshCw,
// // //   Mail,
// // //   FileText,
// // //   Download,
// // // } from "lucide-react";
// // // import { CertificateResponse, CertificateStatus, DNSRecord } from "../types";

// // // export default function CertificateGenerator() {
// // //   const [domain, setDomain] = useState("");
// // //   const [email, setEmail] = useState("");
// // //   const [includeWildcard, setIncludeWildcard] = useState(true);
// // //   const [status, setStatus] = useState<CertificateStatus>(
// // //     CertificateStatus.IDLE
// // //   );
// // //   const [message, setMessage] = useState("");
// // //   const [dnsRecords, setDnsRecords] = useState<DNSRecord[]>([]);
// // //   const [verificationProgress, setVerificationProgress] = useState(0);
// // //   const [certificateInfo, setCertificateInfo] = useState<any>(null);

// // //   const handleSubmit = async (e: React.FormEvent) => {
// // //     e.preventDefault();

// // //     if (!domain || !email) {
// // //       setMessage("Please fill in all required fields");
// // //       return;
// // //     }

// // //     setStatus(CertificateStatus.REQUESTING);
// // //     setMessage("Initiating certificate request...");

// // //     try {
// // //       const response = await fetch("/api/generate-cert", {
// // //         method: "POST",
// // //         headers: { "Content-Type": "application/json" },
// // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // //       });

// // //       const data: CertificateResponse = await response.json();

// // //       if (data.success && data.dnsRecords) {
// // //         setDnsRecords(data.dnsRecords);
// // //         setStatus(CertificateStatus.DNS_PENDING);
// // //         setMessage(
// // //           "DNS TXT records required. Please add these records to your DNS:"
// // //         );
// // //         startDNSVerification(data.dnsRecords);
// // //       } else {
// // //         setStatus(CertificateStatus.ERROR);
// // //         setMessage(data.error || "Certificate request failed");
// // //       }
// // //     } catch (error) {
// // //       setStatus(CertificateStatus.ERROR);
// // //       setMessage("Network error. Please try again.");
// // //     }
// // //   };

// // //   const startDNSVerification = async (records: DNSRecord[]) => {
// // //     const maxAttempts = 30; // 5 minutes with 10-second intervals
// // //     let attempts = 0;

// // //     const checkDNS = async (): Promise<void> => {
// // //       attempts++;
// // //       setVerificationProgress((attempts / maxAttempts) * 100);

// // //       try {
// // //         const response = await fetch("/api/check-dns", {
// // //           method: "POST",
// // //           headers: { "Content-Type": "application/json" },
// // //           body: JSON.stringify({ records }),
// // //         });

// // //         const data = await response.json();

// // //         if (data.verified) {
// // //           setStatus(CertificateStatus.VERIFYING);
// // //           setMessage("DNS records verified! Finalizing certificate...");
// // //           await verifyCertificate();
// // //         } else if (attempts < maxAttempts) {
// // //           setMessage(
// // //             `DNS verification in progress... (${attempts}/${maxAttempts})`
// // //           );
// // //           setTimeout(checkDNS, 10000); // Check every 10 seconds
// // //         } else {
// // //           setStatus(CertificateStatus.ERROR);
// // //           setMessage(
// // //             "DNS verification timeout. Please ensure records are properly configured."
// // //           );
// // //         }
// // //       } catch (error) {
// // //         if (attempts < maxAttempts) {
// // //           setTimeout(checkDNS, 10000);
// // //         } else {
// // //           setStatus(CertificateStatus.ERROR);
// // //           setMessage("DNS verification failed. Please try again.");
// // //         }
// // //       }
// // //     };

// // //     // Start checking after 30 seconds to allow DNS propagation
// // //     setTimeout(checkDNS, 30000);
// // //   };

// // //   const verifyCertificate = async () => {
// // //     try {
// // //       const response = await fetch("/api/verify-cert", {
// // //         method: "POST",
// // //         headers: { "Content-Type": "application/json" },
// // //         body: JSON.stringify({ domain }),
// // //       });

// // //       const data = await response.json();

// // //       if (data.success) {
// // //         setStatus(CertificateStatus.SUCCESS);
// // //         setMessage("SSL certificate generated successfully!");
// // //         setCertificateInfo(data.certificate);
// // //       } else {
// // //         setStatus(CertificateStatus.ERROR);
// // //         setMessage(data.error || "Certificate verification failed");
// // //       }
// // //     } catch (error) {
// // //       setStatus(CertificateStatus.ERROR);
// // //       setMessage("Certificate verification error");
// // //     }
// // //   };

// // //   const copyToClipboard = (text: string) => {
// // //     navigator.clipboard.writeText(text);
// // //   };

// // //   const resetForm = () => {
// // //     setStatus(CertificateStatus.IDLE);
// // //     setMessage("");
// // //     setDnsRecords([]);
// // //     setVerificationProgress(0);
// // //     setCertificateInfo(null);
// // //   };

// // //   const getStatusIcon = () => {
// // //     switch (status) {
// // //       case CertificateStatus.REQUESTING:
// // //       case CertificateStatus.VERIFYING:
// // //         return <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />;
// // //       case CertificateStatus.DNS_PENDING:
// // //         return <Clock className="w-6 h-6 text-yellow-500" />;
// // //       case CertificateStatus.SUCCESS:
// // //         return <CheckCircle className="w-6 h-6 text-green-500" />;
// // //       case CertificateStatus.ERROR:
// // //         return <AlertCircle className="w-6 h-6 text-red-500" />;
// // //       default:
// // //         return <Shield className="w-6 h-6 text-gray-500" />;
// // //     }
// // //   };

// // //   return (
// // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
// // //       <div className="max-w-4xl mx-auto">
// // //         {/* Header */}
// // //         <motion.div
// // //           initial={{ opacity: 0, y: -20 }}
// // //           animate={{ opacity: 1, y: 0 }}
// // //           className="text-center mb-12"
// // //         >
// // //           <div className="flex items-center justify-center mb-4">
// // //             <Shield className="w-12 h-12 text-blue-600 mr-3" />
// // //             <h1 className="text-4xl font-bold text-gray-900">
// // //               Let's Encrypt SSL Generator
// // //             </h1>
// // //           </div>
// // //           <p className="text-xl text-gray-600">
// // //             Generate free SSL certificates with automatic DNS verification
// // //           </p>
// // //         </motion.div>

// // //         {/* Main Form */}
// // //         <motion.div
// // //           initial={{ opacity: 0, scale: 0.95 }}
// // //           animate={{ opacity: 1, scale: 1 }}
// // //           className="bg-white rounded-2xl shadow-xl p-8 mb-8"
// // //         >
// // //           <form onSubmit={handleSubmit} className="space-y-6">
// // //             <div className="grid md:grid-cols-2 gap-6">
// // //               <div>
// // //                 <label className="block text-sm font-semibold text-gray-700 mb-2">
// // //                   <Globe className="w-4 h-4 inline mr-2" />
// // //                   Domain Name
// // //                 </label>
// // //                 <input
// // //                   type="text"
// // //                   value={domain}
// // //                   onChange={(e) => setDomain(e.target.value)}
// // //                   placeholder="example.com"
// // //                   className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
// // //                   disabled={status !== CertificateStatus.IDLE}
// // //                 />
// // //               </div>

// // //               <div>
// // //                 <label className="block text-sm font-semibold text-gray-700 mb-2">
// // //                   <Mail className="w-4 h-4 inline mr-2" />
// // //                   Email Address
// // //                 </label>
// // //                 <input
// // //                   type="email"
// // //                   value={email}
// // //                   onChange={(e) => setEmail(e.target.value)}
// // //                   placeholder="admin@example.com"
// // //                   className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
// // //                   disabled={status !== CertificateStatus.IDLE}
// // //                 />
// // //               </div>
// // //             </div>

// // //             <div className="flex items-center">
// // //               <input
// // //                 type="checkbox"
// // //                 id="wildcard"
// // //                 checked={includeWildcard}
// // //                 onChange={(e) => setIncludeWildcard(e.target.checked)}
// // //                 className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
// // //                 disabled={status !== CertificateStatus.IDLE}
// // //               />
// // //               <label htmlFor="wildcard" className="ml-2 text-sm text-gray-700">
// // //                 Include wildcard certificate (*.{domain || "example.com"})
// // //               </label>
// // //             </div>

// // //             <button
// // //               type="submit"
// // //               disabled={status !== CertificateStatus.IDLE}
// // //               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
// // //             >
// // //               {status === CertificateStatus.IDLE
// // //                 ? "Generate SSL Certificate"
// // //                 : "Processing..."}
// // //             </button>
// // //           </form>
// // //         </motion.div>

// // //         {/* Status Display */}
// // //         <AnimatePresence>
// // //           {status !== CertificateStatus.IDLE && (
// // //             <motion.div
// // //               initial={{ opacity: 0, y: 20 }}
// // //               animate={{ opacity: 1, y: 0 }}
// // //               exit={{ opacity: 0, y: -20 }}
// // //               className="bg-white rounded-2xl shadow-xl p-8 mb-8"
// // //             >
// // //               <div className="flex items-center mb-4">
// // //                 {getStatusIcon()}
// // //                 <h2 className="text-2xl font-bold text-gray-900 ml-3">
// // //                   Certificate Status
// // //                 </h2>
// // //               </div>

// // //               <p className="text-gray-700 mb-4">{message}</p>

// // //               {status === CertificateStatus.DNS_PENDING &&
// // //                 verificationProgress > 0 && (
// // //                   <div className="mb-4">
// // //                     <div className="flex justify-between text-sm text-gray-600 mb-1">
// // //                       <span>DNS Verification Progress</span>
// // //                       <span>{Math.round(verificationProgress)}%</span>
// // //                     </div>
// // //                     <div className="w-full bg-gray-200 rounded-full h-2">
// // //                       <motion.div
// // //                         className="bg-blue-500 h-2 rounded-full"
// // //                         initial={{ width: 0 }}
// // //                         animate={{ width: `${verificationProgress}%` }}
// // //                         transition={{ duration: 0.5 }}
// // //                       />
// // //                     </div>
// // //                   </div>
// // //                 )}

// // //               {(status === CertificateStatus.SUCCESS ||
// // //                 status === CertificateStatus.ERROR) && (
// // //                 <button
// // //                   onClick={resetForm}
// // //                   className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
// // //                 >
// // //                   Generate Another Certificate
// // //                 </button>
// // //               )}
// // //             </motion.div>
// // //           )}
// // //         </AnimatePresence>

// // //         {/* DNS Records */}
// // //         <AnimatePresence>
// // //           {dnsRecords.length > 0 && (
// // //             <motion.div
// // //               initial={{ opacity: 0, y: 20 }}
// // //               animate={{ opacity: 1, y: 0 }}
// // //               exit={{ opacity: 0, y: -20 }}
// // //               className="bg-white rounded-2xl shadow-xl p-8 mb-8"
// // //             >
// // //               <h3 className="text-xl font-bold text-gray-900 mb-4">
// // //                 <FileText className="w-5 h-5 inline mr-2" />
// // //                 Required DNS TXT Records
// // //               </h3>
// // //               <p className="text-gray-600 mb-6">
// // //                 Add these TXT records to your DNS provider to verify domain
// // //                 ownership:
// // //               </p>

// // //               <div className="space-y-4">
// // //                 {dnsRecords.map((record, index) => (
// // //                   <div key={index} className="bg-gray-50 rounded-lg p-4">
// // //                     <div className="grid md:grid-cols-3 gap-4">
// // //                       <div>
// // //                         <label className="block text-sm font-semibold text-gray-700 mb-1">
// // //                           Name
// // //                         </label>
// // //                         <div className="flex items-center">
// // //                           <code className="bg-white px-2 py-1 rounded border text-sm flex-1">
// // //                             {record.name}
// // //                           </code>
// // //                           <button
// // //                             onClick={() => copyToClipboard(record.name)}
// // //                             className="ml-2 p-1 text-gray-500 hover:text-gray-700"
// // //                           >
// // //                             <Copy className="w-4 h-4" />
// // //                           </button>
// // //                         </div>
// // //                       </div>

// // //                       <div>
// // //                         <label className="block text-sm font-semibold text-gray-700 mb-1">
// // //                           Type
// // //                         </label>
// // //                         <code className="bg-white px-2 py-1 rounded border text-sm block">
// // //                           {record.type}
// // //                         </code>
// // //                       </div>

// // //                       <div>
// // //                         <label className="block text-sm font-semibold text-gray-700 mb-1">
// // //                           Value
// // //                         </label>
// // //                         <div className="flex items-center">
// // //                           <code className="bg-white px-2 py-1 rounded border text-sm flex-1 truncate">
// // //                             {record.value}
// // //                           </code>
// // //                           <button
// // //                             onClick={() => copyToClipboard(record.value)}
// // //                             className="ml-2 p-1 text-gray-500 hover:text-gray-700"
// // //                           >
// // //                             <Copy className="w-4 h-4" />
// // //                           </button>
// // //                         </div>
// // //                       </div>
// // //                     </div>
// // //                   </div>
// // //                 ))}
// // //               </div>

// // //               <div className="mt-6 p-4 bg-blue-50 rounded-lg">
// // //                 <p className="text-blue-800 text-sm">
// // //                   <strong>Note:</strong> DNS propagation can take up to 30
// // //                   minutes. The system will automatically verify these records
// // //                   once they're detected.
// // //                 </p>
// // //               </div>
// // //             </motion.div>
// // //           )}
// // //         </AnimatePresence>

// // //         {/* Certificate Info */}
// // //         <AnimatePresence>
// // //           {certificateInfo && (
// // //             <motion.div
// // //               initial={{ opacity: 0, y: 20 }}
// // //               animate={{ opacity: 1, y: 0 }}
// // //               exit={{ opacity: 0, y: -20 }}
// // //               className="bg-white rounded-2xl shadow-xl p-8"
// // //             >
// // //               <h3 className="text-xl font-bold text-gray-900 mb-4">
// // //                 <CheckCircle className="w-5 h-5 inline mr-2 text-green-500" />
// // //                 Certificate Information
// // //               </h3>

// // //               <div className="grid md:grid-cols-2 gap-6">
// // //                 <div>
// // //                   <h4 className="font-semibold text-gray-700 mb-2">
// // //                     Certificate Details
// // //                   </h4>
// // //                   <p>
// // //                     <strong>Domain:</strong> {certificateInfo.domain}
// // //                   </p>
// // //                   <p>
// // //                     <strong>Expires:</strong> {certificateInfo.expiryDate}
// // //                   </p>
// // //                 </div>

// // //                 <div>
// // //                   <h4 className="font-semibold text-gray-700 mb-2">
// // //                     File Locations
// // //                   </h4>
// // //                   <div className="space-y-1 text-sm">
// // //                     <p>
// // //                       <strong>Certificate:</strong>{" "}
// // //                       <code>{certificateInfo.paths.certificate}</code>
// // //                     </p>
// // //                     <p>
// // //                       <strong>Private Key:</strong>{" "}
// // //                       <code>{certificateInfo.paths.privateKey}</code>
// // //                     </p>
// // //                     <p>
// // //                       <strong>Chain:</strong>{" "}
// // //                       <code>{certificateInfo.paths.chain}</code>
// // //                     </p>
// // //                     <p>
// // //                       <strong>Full Chain:</strong>{" "}
// // //                       <code>{certificateInfo.paths.fullchain}</code>
// // //                     </p>
// // //                   </div>
// // //                 </div>
// // //               </div>
// // //             </motion.div>
// // //           )}
// // //         </AnimatePresence>
// // //       </div>
// // //     </div>
// // //   );
// // // }
