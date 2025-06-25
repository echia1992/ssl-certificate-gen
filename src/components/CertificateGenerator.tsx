"use client";
import React, { useState } from "react";
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
} from "lucide-react";

const SSLGenerator = () => {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [includeWildcard, setIncludeWildcard] = useState(false);
  const [generationType, setGenerationType] = useState("instructions"); // 'instructions' or 'download'
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copiedItems, setCopiedItems] = useState(new Set());

  const copyToClipboard = async (text, itemId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems((prev) => new Set([...prev, itemId]));
      setTimeout(() => {
        setCopiedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);

      setCopiedItems((prev) => new Set([...prev, itemId]));
      setTimeout(() => {
        setCopiedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    }
  };

  const downloadFile = (content, filename) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const CopyButton = ({ text, itemId, className = "" }) => {
    const isCopied = copiedItems.has(itemId);

    return (
      <button
        onClick={() => copyToClipboard(text, itemId)}
        className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${className} ${
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

  const CertificateFile = ({
    title,
    content,
    filename,
    icon: Icon,
    description,
  }) => (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-blue-600" />
          <h5 className="font-medium text-gray-800">{title}</h5>
        </div>
        <div className="flex gap-2">
          <CopyButton text={content} itemId={`cert-${filename}`} />
          <button
            onClick={() => downloadFile(content, filename)}
            className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
            title="Download file"
          >
            <Download size={14} />
            Download
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-2">{description}</p>
      <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-40 overflow-y-auto">
        <pre>{content}</pre>
      </div>
    </div>
  );

  const generateCertificate = async () => {
    if (!domain || !email) return;

    setLoading(true);
    setResult(null);

    try {
      const endpoint =
        generationType === "download"
          ? "/api/generate-cert-download"
          : "/api/generate-cert";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain,
          email,
          includeWildcard,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: "Failed to connect to server",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              Let's Encrypt SSL Generator
            </h1>
          </div>
          <p className="text-gray-600">
            Generate free SSL certificates with automatic DNS verification
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="space-y-4">
            {/* Generation Type Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Certificate Generation Method
              </label>
              <div className="grid md:grid-cols-2 gap-4">
                <div
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    generationType === "instructions"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setGenerationType("instructions")}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal size={20} className="text-blue-600" />
                    <h4 className="font-medium">Server Installation</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Get DNS verification steps and server commands. Certificate
                    will be installed directly on your server.
                  </p>
                </div>

                <div
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                    generationType === "download"
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setGenerationType("download")}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Download size={20} className="text-blue-600" />
                    <h4 className="font-medium">Download Files</h4>
                  </div>
                  <p className="text-sm text-gray-600">
                    Generate and download certificate files (.pem) for manual
                    installation on any server.
                  </p>
                </div>
              </div>
            </div>

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
              onClick={generateCertificate}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Processing..." : "Generate Certificate"}
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              {result.success ? (
                <div className="flex items-center gap-2 text-green-700">
                  <Check className="w-5 h-5" />
                  <h3 className="text-lg font-semibold">Success!</h3>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <h3 className="text-lg font-semibold">Certificate Status</h3>
                </div>
              )}
            </div>

            {/* Certificate Files Display */}
            {result.success && result.certificateFiles && (
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Award size={20} />
                  Generated Certificate Files
                </h4>

                <div className="grid gap-4">
                  {result.certificateFiles.fullchain && (
                    <CertificateFile
                      title="Full Chain Certificate"
                      content={result.certificateFiles.fullchain}
                      filename={`${domain}_fullchain.pem`}
                      icon={Award}
                      description="Complete certificate chain - use this for most web servers (Nginx, Apache, etc.)"
                    />
                  )}

                  {result.certificateFiles.privkey && (
                    <CertificateFile
                      title="Private Key"
                      content={result.certificateFiles.privkey}
                      filename={`${domain}_privkey.pem`}
                      icon={Key}
                      description="Private key - KEEP THIS SECURE! Never share this file."
                    />
                  )}

                  {result.certificateFiles.cert && (
                    <CertificateFile
                      title="Certificate Only"
                      content={result.certificateFiles.cert}
                      filename={`${domain}_cert.pem`}
                      icon={FileText}
                      description="Your domain certificate only (without intermediate certificates)"
                    />
                  )}

                  {result.certificateFiles.chain && (
                    <CertificateFile
                      title="Certificate Chain"
                      content={result.certificateFiles.chain}
                      filename={`${domain}_chain.pem`}
                      icon={FileText}
                      description="Intermediate certificates chain"
                    />
                  )}
                </div>

                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h5 className="font-medium text-blue-900 mb-2">
                    Installation Instructions:
                  </h5>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>
                      • Upload <code>fullchain.pem</code> and{" "}
                      <code>privkey.pem</code> to your server
                    </li>
                    <li>• Configure your web server to use these files</li>
                    <li>
                      • Keep <code>privkey.pem</code> secure and never share it
                      publicly
                    </li>
                    <li>
                      • Certificates expire in 90 days - set up auto-renewal
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* DNS Records for Verification */}
            {result.dnsRecords && result.dnsRecords.length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-800 mb-3">
                  DNS Records to Add for Verification
                </h4>
                <div className="space-y-3">
                  {result.dnsRecords.map((record, index) => (
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
                            <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
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
                              {record.type}
                            </code>
                            <CopyButton
                              text={record.type}
                              itemId={`type-${index}`}
                            />
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
              </div>
            )}

            {/* Server Command */}
            {result.success && result.serverCommand && (
              <div className="mb-6">
                <h4 className="text-md font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Terminal size={16} />
                  Server Command
                </h4>
                <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm relative">
                  <code>{result.serverCommand}</code>
                  <div className="absolute top-2 right-2">
                    <CopyButton
                      text={result.serverCommand}
                      itemId="server-command"
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300"
                    />
                  </div>
                </div>
              </div>
            )}

            {result.message && (
              <div
                className={`p-3 rounded-md ${
                  result.success
                    ? "bg-green-50 text-green-800"
                    : "bg-red-50 text-red-800"
                }`}
              >
                {result.message}
              </div>
            )}

            {result.error && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
                <strong>Error:</strong> {result.error}
              </div>
            )}

            <button
              onClick={() => {
                setResult(null);
                setDomain("");
                setEmail("");
                setIncludeWildcard(false);
              }}
              className="mt-4 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
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
// import React, { useState } from "react";
// import {
//   Copy,
//   Check,
//   Shield,
//   Globe,
//   Mail,
//   AlertCircle,
//   Terminal,
// } from "lucide-react";

// const SSLGenerator = () => {
//   const [domain, setDomain] = useState("");
//   const [email, setEmail] = useState("");
//   const [includeWildcard, setIncludeWildcard] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [result, setResult] = useState(null);
//   const [copiedItems, setCopiedItems] = useState(new Set());

//   const copyToClipboard = async (text, itemId) => {
//     try {
//       await navigator.clipboard.writeText(text);
//       setCopiedItems((prev) => new Set([...prev, itemId]));
//       setTimeout(() => {
//         setCopiedItems((prev) => {
//           const newSet = new Set(prev);
//           newSet.delete(itemId);
//           return newSet;
//         });
//       }, 2000);
//     } catch (err) {
//       // Fallback for older browsers
//       const textArea = document.createElement("textarea");
//       textArea.value = text;
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

//   const CopyButton = ({ text, itemId, className = "" }) => {
//     const isCopied = copiedItems.has(itemId);

//     return (
//       <button
//         onClick={() => copyToClipboard(text, itemId)}
//         className={`inline-flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors ${className} ${
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

//   const generateCertificate = async () => {
//     if (!domain || !email) return;

//     setLoading(true);
//     setResult(null);

//     try {
//       const response = await fetch("/api/generate-cert", {
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
//         error: "Failed to connect to server",
//       });
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
//       <div className="max-w-4xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <div className="flex items-center justify-center gap-2 mb-4">
//             <Shield className="w-8 h-8 text-blue-600" />
//             <h1 className="text-3xl font-bold text-gray-900">
//               Let's Encrypt SSL Generator
//             </h1>
//           </div>
//           <p className="text-gray-600">
//             Generate free SSL certificates with automatic DNS verification
//           </p>
//         </div>

//         {/* Form */}
//         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
//           <div className="space-y-4">
//             <div className="grid md:grid-cols-2 gap-4">
//               <div>
//                 <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
//                   <Globe size={16} />
//                   Domain Name
//                 </label>
//                 <input
//                   type="domain"
//                   value={domain}
//                   autoComplete=""
//                   onChange={(e) => setDomain(e.target.value)}
//                   placeholder="example.com"
//                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   required
//                 />
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
//               disabled={loading}
//               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
//             >
//               {loading ? "Processing..." : "Generate Certificate"}
//             </button>
//           </div>
//         </div>

//         {/* Results */}
//         {result && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <div className="flex items-center gap-2 mb-4">
//               {result.success ? (
//                 <div className="flex items-center gap-2 text-green-700">
//                   <Check className="w-5 h-5" />
//                   <h3 className="text-lg font-semibold">Success!</h3>
//                 </div>
//               ) : (
//                 <div className="flex items-center gap-2 text-red-700">
//                   <AlertCircle className="w-5 h-5" />
//                   <h3 className="text-lg font-semibold">Certificate Status</h3>
//                 </div>
//               )}
//             </div>

//             {result.success && result.serverCommand && (
//               <div className="mb-6">
//                 <h4 className="text-md font-semibold text-gray-800 mb-2 flex items-center gap-2">
//                   <Terminal size={16} />
//                   Server Command
//                 </h4>
//                 <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm relative">
//                   <code>{result.serverCommand}</code>
//                   <div className="absolute top-2 right-2">
//                     <CopyButton
//                       text={result.serverCommand}
//                       itemId="server-command"
//                       className="bg-gray-800 hover:bg-gray-700 text-gray-300"
//                     />
//                   </div>
//                 </div>
//                 <p className="text-sm text-gray-600 mt-2">
//                   Run this command on your server to start the certificate
//                   generation process.
//                 </p>
//               </div>
//             )}

//             {result.dnsRecords && result.dnsRecords.length > 0 && (
//               <div className="mb-6">
//                 <h4 className="text-md font-semibold text-gray-800 mb-3">
//                   DNS Records to Add
//                 </h4>
//                 <div className="space-y-3">
//                   {result.dnsRecords.map((record, index) => (
//                     <div
//                       key={index}
//                       className="border border-gray-200 rounded-lg p-4 bg-gray-50"
//                     >
//                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
//                         <div>
//                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                             Record Name
//                           </label>
//                           <div className="flex items-center gap-2 mt-1">
//                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
//                               {record.name}
//                             </code>
//                             <CopyButton
//                               text={record.name}
//                               itemId={`name-${index}`}
//                             />
//                           </div>
//                         </div>

//                         <div>
//                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                             Record Type
//                           </label>
//                           <div className="flex items-center gap-2 mt-1">
//                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
//                               {record.type}
//                             </code>
//                             <CopyButton
//                               text={record.type}
//                               itemId={`type-${index}`}
//                             />
//                           </div>
//                         </div>

//                         <div>
//                           <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
//                             Record Value
//                           </label>
//                           <div className="flex items-center gap-2 mt-1">
//                             <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
//                               {record.value}
//                             </code>
//                             <CopyButton
//                               text={record.value}
//                               itemId={`value-${index}`}
//                             />
//                           </div>
//                         </div>
//                       </div>

//                       <div className="mt-3 pt-3 border-t border-gray-200">
//                         <div className="flex items-center justify-between">
//                           <span className="text-sm text-gray-600">
//                             Domain:{" "}
//                             <code className="font-mono">{record.domain}</code>
//                           </span>
//                           <CopyButton
//                             text={`${record.name} TXT ${record.value}`}
//                             itemId={`full-record-${index}`}
//                             className="text-xs"
//                           />
//                         </div>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {result.instructions && (
//               <div className="mb-6">
//                 <h4 className="text-md font-semibold text-gray-800 mb-3">
//                   Instructions
//                 </h4>
//                 {result.instructions.map((instruction, index) => (
//                   <div
//                     key={index}
//                     className="border border-blue-200 rounded-lg p-4 bg-blue-50 mb-3"
//                   >
//                     <h5 className="font-medium text-blue-900 mb-2">
//                       {instruction.domain}
//                     </h5>
//                     <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
//                       {instruction.steps.map((step, stepIndex) => (
//                         <li key={stepIndex}>{step}</li>
//                       ))}
//                     </ol>
//                   </div>
//                 ))}
//               </div>
//             )}

//             {result.message && (
//               <div
//                 className={`p-3 rounded-md ${
//                   result.success
//                     ? "bg-green-50 text-green-800"
//                     : "bg-red-50 text-red-800"
//                 }`}
//               >
//                 {result.message}
//               </div>
//             )}

//             {result.error && (
//               <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md">
//                 <strong>Error:</strong> {result.error}
//               </div>
//             )}

//             {result.note && (
//               <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md mt-3">
//                 <strong>Note:</strong> {result.note}
//               </div>
//             )}

//             <button
//               onClick={() => {
//                 setResult(null);
//                 setDomain("");
//                 setEmail("");
//                 setIncludeWildcard(false);
//               }}
//               className="mt-4 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
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

// "use client";

// import { useState, useEffect } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import {
//   Shield,
//   Globe,
//   CheckCircle,
//   AlertCircle,
//   Clock,
//   Copy,
//   RefreshCw,
//   Mail,
//   FileText,
//   Download,
// } from "lucide-react";
// import { CertificateResponse, CertificateStatus, DNSRecord } from "../types";

// export default function CertificateGenerator() {
//   const [domain, setDomain] = useState("");
//   const [email, setEmail] = useState("");
//   const [includeWildcard, setIncludeWildcard] = useState(true);
//   const [status, setStatus] = useState<CertificateStatus>(
//     CertificateStatus.IDLE
//   );
//   const [message, setMessage] = useState("");
//   const [dnsRecords, setDnsRecords] = useState<DNSRecord[]>([]);
//   const [verificationProgress, setVerificationProgress] = useState(0);
//   const [certificateInfo, setCertificateInfo] = useState<any>(null);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (!domain || !email) {
//       setMessage("Please fill in all required fields");
//       return;
//     }

//     setStatus(CertificateStatus.REQUESTING);
//     setMessage("Initiating certificate request...");

//     try {
//       const response = await fetch("/api/generate-cert", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ domain, email, includeWildcard }),
//       });

//       const data: CertificateResponse = await response.json();

//       if (data.success && data.dnsRecords) {
//         setDnsRecords(data.dnsRecords);
//         setStatus(CertificateStatus.DNS_PENDING);
//         setMessage(
//           "DNS TXT records required. Please add these records to your DNS:"
//         );
//         startDNSVerification(data.dnsRecords);
//       } else {
//         setStatus(CertificateStatus.ERROR);
//         setMessage(data.error || "Certificate request failed");
//       }
//     } catch (error) {
//       setStatus(CertificateStatus.ERROR);
//       setMessage("Network error. Please try again.");
//     }
//   };

//   const startDNSVerification = async (records: DNSRecord[]) => {
//     const maxAttempts = 30; // 5 minutes with 10-second intervals
//     let attempts = 0;

//     const checkDNS = async (): Promise<void> => {
//       attempts++;
//       setVerificationProgress((attempts / maxAttempts) * 100);

//       try {
//         const response = await fetch("/api/check-dns", {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({ records }),
//         });

//         const data = await response.json();

//         if (data.verified) {
//           setStatus(CertificateStatus.VERIFYING);
//           setMessage("DNS records verified! Finalizing certificate...");
//           await verifyCertificate();
//         } else if (attempts < maxAttempts) {
//           setMessage(
//             `DNS verification in progress... (${attempts}/${maxAttempts})`
//           );
//           setTimeout(checkDNS, 10000); // Check every 10 seconds
//         } else {
//           setStatus(CertificateStatus.ERROR);
//           setMessage(
//             "DNS verification timeout. Please ensure records are properly configured."
//           );
//         }
//       } catch (error) {
//         if (attempts < maxAttempts) {
//           setTimeout(checkDNS, 10000);
//         } else {
//           setStatus(CertificateStatus.ERROR);
//           setMessage("DNS verification failed. Please try again.");
//         }
//       }
//     };

//     // Start checking after 30 seconds to allow DNS propagation
//     setTimeout(checkDNS, 30000);
//   };

//   const verifyCertificate = async () => {
//     try {
//       const response = await fetch("/api/verify-cert", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ domain }),
//       });

//       const data = await response.json();

//       if (data.success) {
//         setStatus(CertificateStatus.SUCCESS);
//         setMessage("SSL certificate generated successfully!");
//         setCertificateInfo(data.certificate);
//       } else {
//         setStatus(CertificateStatus.ERROR);
//         setMessage(data.error || "Certificate verification failed");
//       }
//     } catch (error) {
//       setStatus(CertificateStatus.ERROR);
//       setMessage("Certificate verification error");
//     }
//   };

//   const copyToClipboard = (text: string) => {
//     navigator.clipboard.writeText(text);
//   };

//   const resetForm = () => {
//     setStatus(CertificateStatus.IDLE);
//     setMessage("");
//     setDnsRecords([]);
//     setVerificationProgress(0);
//     setCertificateInfo(null);
//   };

//   const getStatusIcon = () => {
//     switch (status) {
//       case CertificateStatus.REQUESTING:
//       case CertificateStatus.VERIFYING:
//         return <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />;
//       case CertificateStatus.DNS_PENDING:
//         return <Clock className="w-6 h-6 text-yellow-500" />;
//       case CertificateStatus.SUCCESS:
//         return <CheckCircle className="w-6 h-6 text-green-500" />;
//       case CertificateStatus.ERROR:
//         return <AlertCircle className="w-6 h-6 text-red-500" />;
//       default:
//         return <Shield className="w-6 h-6 text-gray-500" />;
//     }
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
//       <div className="max-w-4xl mx-auto">
//         {/* Header */}
//         <motion.div
//           initial={{ opacity: 0, y: -20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="text-center mb-12"
//         >
//           <div className="flex items-center justify-center mb-4">
//             <Shield className="w-12 h-12 text-blue-600 mr-3" />
//             <h1 className="text-4xl font-bold text-gray-900">
//               Let's Encrypt SSL Generator
//             </h1>
//           </div>
//           <p className="text-xl text-gray-600">
//             Generate free SSL certificates with automatic DNS verification
//           </p>
//         </motion.div>

//         {/* Main Form */}
//         <motion.div
//           initial={{ opacity: 0, scale: 0.95 }}
//           animate={{ opacity: 1, scale: 1 }}
//           className="bg-white rounded-2xl shadow-xl p-8 mb-8"
//         >
//           <form onSubmit={handleSubmit} className="space-y-6">
//             <div className="grid md:grid-cols-2 gap-6">
//               <div>
//                 <label className="block text-sm font-semibold text-gray-700 mb-2">
//                   <Globe className="w-4 h-4 inline mr-2" />
//                   Domain Name
//                 </label>
//                 <input
//                   type="text"
//                   value={domain}
//                   onChange={(e) => setDomain(e.target.value)}
//                   placeholder="example.com"
//                   className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
//                   disabled={status !== CertificateStatus.IDLE}
//                 />
//               </div>

//               <div>
//                 <label className="block text-sm font-semibold text-gray-700 mb-2">
//                   <Mail className="w-4 h-4 inline mr-2" />
//                   Email Address
//                 </label>
//                 <input
//                   type="email"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="admin@example.com"
//                   className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
//                   disabled={status !== CertificateStatus.IDLE}
//                 />
//               </div>
//             </div>

//             <div className="flex items-center">
//               <input
//                 type="checkbox"
//                 id="wildcard"
//                 checked={includeWildcard}
//                 onChange={(e) => setIncludeWildcard(e.target.checked)}
//                 className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
//                 disabled={status !== CertificateStatus.IDLE}
//               />
//               <label htmlFor="wildcard" className="ml-2 text-sm text-gray-700">
//                 Include wildcard certificate (*.{domain || "example.com"})
//               </label>
//             </div>

//             <button
//               type="submit"
//               disabled={status !== CertificateStatus.IDLE}
//               className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
//             >
//               {status === CertificateStatus.IDLE
//                 ? "Generate SSL Certificate"
//                 : "Processing..."}
//             </button>
//           </form>
//         </motion.div>

//         {/* Status Display */}
//         <AnimatePresence>
//           {status !== CertificateStatus.IDLE && (
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -20 }}
//               className="bg-white rounded-2xl shadow-xl p-8 mb-8"
//             >
//               <div className="flex items-center mb-4">
//                 {getStatusIcon()}
//                 <h2 className="text-2xl font-bold text-gray-900 ml-3">
//                   Certificate Status
//                 </h2>
//               </div>

//               <p className="text-gray-700 mb-4">{message}</p>

//               {status === CertificateStatus.DNS_PENDING &&
//                 verificationProgress > 0 && (
//                   <div className="mb-4">
//                     <div className="flex justify-between text-sm text-gray-600 mb-1">
//                       <span>DNS Verification Progress</span>
//                       <span>{Math.round(verificationProgress)}%</span>
//                     </div>
//                     <div className="w-full bg-gray-200 rounded-full h-2">
//                       <motion.div
//                         className="bg-blue-500 h-2 rounded-full"
//                         initial={{ width: 0 }}
//                         animate={{ width: `${verificationProgress}%` }}
//                         transition={{ duration: 0.5 }}
//                       />
//                     </div>
//                   </div>
//                 )}

//               {(status === CertificateStatus.SUCCESS ||
//                 status === CertificateStatus.ERROR) && (
//                 <button
//                   onClick={resetForm}
//                   className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
//                 >
//                   Generate Another Certificate
//                 </button>
//               )}
//             </motion.div>
//           )}
//         </AnimatePresence>

//         {/* DNS Records */}
//         <AnimatePresence>
//           {dnsRecords.length > 0 && (
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -20 }}
//               className="bg-white rounded-2xl shadow-xl p-8 mb-8"
//             >
//               <h3 className="text-xl font-bold text-gray-900 mb-4">
//                 <FileText className="w-5 h-5 inline mr-2" />
//                 Required DNS TXT Records
//               </h3>
//               <p className="text-gray-600 mb-6">
//                 Add these TXT records to your DNS provider to verify domain
//                 ownership:
//               </p>

//               <div className="space-y-4">
//                 {dnsRecords.map((record, index) => (
//                   <div key={index} className="bg-gray-50 rounded-lg p-4">
//                     <div className="grid md:grid-cols-3 gap-4">
//                       <div>
//                         <label className="block text-sm font-semibold text-gray-700 mb-1">
//                           Name
//                         </label>
//                         <div className="flex items-center">
//                           <code className="bg-white px-2 py-1 rounded border text-sm flex-1">
//                             {record.name}
//                           </code>
//                           <button
//                             onClick={() => copyToClipboard(record.name)}
//                             className="ml-2 p-1 text-gray-500 hover:text-gray-700"
//                           >
//                             <Copy className="w-4 h-4" />
//                           </button>
//                         </div>
//                       </div>

//                       <div>
//                         <label className="block text-sm font-semibold text-gray-700 mb-1">
//                           Type
//                         </label>
//                         <code className="bg-white px-2 py-1 rounded border text-sm block">
//                           {record.type}
//                         </code>
//                       </div>

//                       <div>
//                         <label className="block text-sm font-semibold text-gray-700 mb-1">
//                           Value
//                         </label>
//                         <div className="flex items-center">
//                           <code className="bg-white px-2 py-1 rounded border text-sm flex-1 truncate">
//                             {record.value}
//                           </code>
//                           <button
//                             onClick={() => copyToClipboard(record.value)}
//                             className="ml-2 p-1 text-gray-500 hover:text-gray-700"
//                           >
//                             <Copy className="w-4 h-4" />
//                           </button>
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 ))}
//               </div>

//               <div className="mt-6 p-4 bg-blue-50 rounded-lg">
//                 <p className="text-blue-800 text-sm">
//                   <strong>Note:</strong> DNS propagation can take up to 30
//                   minutes. The system will automatically verify these records
//                   once they're detected.
//                 </p>
//               </div>
//             </motion.div>
//           )}
//         </AnimatePresence>

//         {/* Certificate Info */}
//         <AnimatePresence>
//           {certificateInfo && (
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               exit={{ opacity: 0, y: -20 }}
//               className="bg-white rounded-2xl shadow-xl p-8"
//             >
//               <h3 className="text-xl font-bold text-gray-900 mb-4">
//                 <CheckCircle className="w-5 h-5 inline mr-2 text-green-500" />
//                 Certificate Information
//               </h3>

//               <div className="grid md:grid-cols-2 gap-6">
//                 <div>
//                   <h4 className="font-semibold text-gray-700 mb-2">
//                     Certificate Details
//                   </h4>
//                   <p>
//                     <strong>Domain:</strong> {certificateInfo.domain}
//                   </p>
//                   <p>
//                     <strong>Expires:</strong> {certificateInfo.expiryDate}
//                   </p>
//                 </div>

//                 <div>
//                   <h4 className="font-semibold text-gray-700 mb-2">
//                     File Locations
//                   </h4>
//                   <div className="space-y-1 text-sm">
//                     <p>
//                       <strong>Certificate:</strong>{" "}
//                       <code>{certificateInfo.paths.certificate}</code>
//                     </p>
//                     <p>
//                       <strong>Private Key:</strong>{" "}
//                       <code>{certificateInfo.paths.privateKey}</code>
//                     </p>
//                     <p>
//                       <strong>Chain:</strong>{" "}
//                       <code>{certificateInfo.paths.chain}</code>
//                     </p>
//                     <p>
//                       <strong>Full Chain:</strong>{" "}
//                       <code>{certificateInfo.paths.fullchain}</code>
//                     </p>
//                   </div>
//                 </div>
//               </div>
//             </motion.div>
//           )}
//         </AnimatePresence>
//       </div>
//     </div>
//   );
// }
