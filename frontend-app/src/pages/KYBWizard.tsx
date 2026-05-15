import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Users, FileText, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import '../index.css';

const steps = [
  { id: 'company', title: 'Company Details', icon: Building2 },
  { id: 'ubo', title: 'Beneficial Owners', icon: Users },
  { id: 'documents', title: 'Document Upload', icon: FileText },
  { id: 'review', title: 'Review & Submit', icon: CheckCircle2 }
];

export const KYBWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    companyName: '',
    registrationNumber: '',
    jurisdiction: 'UAE',
    uboName: '',
    uboPassport: ''
  });

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(c => c + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(c => c - 1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting KYB Data to identity-service:', formData);
    // In a real app, send to API here
    setCurrentStep(3); // Move to review/success
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-mono text-neon-blue mb-2">Institutional KYB Verification</h1>
        <p className="text-gray-400">Complete your compliance profile to unlock tier-1 trading limits.</p>
      </div>

      {/* Stepper */}
      <div className="flex justify-between items-center mb-12 relative">
        <div className="absolute left-0 top-1/2 w-full h-0.5 bg-gray-800 -z-10" />
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === currentStep;
          const isPast = idx < currentStep;
          return (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${isActive ? 'border-neon-blue bg-dark-card shadow-[0_0_15px_rgba(0,240,255,0.3)] text-neon-blue' : isPast ? 'border-neon-purple bg-neon-purple text-white' : 'border-gray-700 bg-dark-bg text-gray-500'}`}>
                <Icon size={20} />
              </div>
              <span className={`mt-3 text-xs font-mono tracking-wider ${isActive ? 'text-neon-blue' : isPast ? 'text-gray-300' : 'text-gray-600'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Form Area */}
      <div className="bg-dark-card border border-gray-800 p-8 rounded-xl shadow-xl relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-neon-blue opacity-5 blur-[100px] pointer-events-none" />

        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-white mb-6">Company Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 font-mono mb-1">LEGAL ENTITY NAME</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full bg-dark-bg border border-gray-700 rounded p-3 text-white focus:border-neon-blue focus:outline-none focus:ring-1 focus:ring-neon-blue transition-all"
                    placeholder="e.g. Falcon Trading LLC"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">REGISTRATION NUMBER</label>
                    <input
                      type="text"
                      value={formData.registrationNumber}
                      onChange={e => setFormData({ ...formData, registrationNumber: e.target.value })}
                      className="w-full bg-dark-bg border border-gray-700 rounded p-3 text-white focus:border-neon-blue focus:outline-none"
                      placeholder="TRN-XXXXXX"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-mono mb-1">JURISDICTION</label>
                    <select
                      value={formData.jurisdiction}
                      onChange={e => setFormData({ ...formData, jurisdiction: e.target.value })}
                      className="w-full bg-dark-bg border border-gray-700 rounded p-3 text-white focus:border-neon-blue focus:outline-none"
                    >
                      <option>UAE</option>
                      <option>Singapore</option>
                      <option>Switzerland</option>
                      <option>United Kingdom</option>
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-white mb-6">Ultimate Beneficial Owners (UBO)</h2>
              <div className="p-4 border border-gray-800 rounded bg-black/50 space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 font-mono mb-1">FULL NAME (PRIMARY UBO)</label>
                  <input
                    type="text"
                    value={formData.uboName}
                    onChange={e => setFormData({ ...formData, uboName: e.target.value })}
                    className="w-full bg-dark-bg border border-gray-700 rounded p-3 text-white focus:border-neon-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-mono mb-1">PASSPORT / ID NUMBER</label>
                  <input
                    type="text"
                    value={formData.uboPassport}
                    onChange={e => setFormData({ ...formData, uboPassport: e.target.value })}
                    className="w-full bg-dark-bg border border-gray-700 rounded p-3 text-white focus:border-neon-blue focus:outline-none"
                  />
                </div>
              </div>
              <button className="text-neon-blue text-sm hover:text-white transition-colors">+ Add Another UBO</button>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-white mb-6">Document Upload</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-neon-blue transition-colors cursor-pointer group">
                  <FileText className="text-gray-500 group-hover:text-neon-blue mb-3" size={32} />
                  <p className="text-sm text-gray-300 font-medium">Certificate of Incorporation</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, JPG up to 10MB</p>
                </div>
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-neon-blue transition-colors cursor-pointer group">
                  <Users className="text-gray-500 group-hover:text-neon-blue mb-3" size={32} />
                  <p className="text-sm text-gray-300 font-medium">UBO Passports</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, JPG up to 10MB</p>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="w-20 h-20 bg-neon-purple/20 text-neon-purple rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 size={40} />
              </motion.div>
              <h2 className="text-2xl text-white mb-2">Application Submitted</h2>
              <p className="text-gray-400 max-w-md mx-auto">
                Your compliance profile is under review by the VARA regulatory team. You will be notified via email once tier-1 trading limits are unlocked.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        {currentStep < 3 && (
          <div className="flex justify-between mt-10 pt-6 border-t border-gray-800">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className={`flex items-center space-x-2 px-4 py-2 rounded font-mono text-sm transition-colors ${currentStep === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 hover:text-white'}`}
            >
              <ArrowLeft size={16} />
              <span>BACK</span>
            </button>
            <button
              onClick={currentStep === 2 ? handleSubmit : handleNext}
              className="flex items-center space-x-2 px-6 py-2 bg-neon-blue text-black font-bold font-mono text-sm rounded hover:bg-white transition-colors shadow-[0_0_15px_rgba(0,240,255,0.4)]"
            >
              <span>{currentStep === 2 ? 'SUBMIT' : 'NEXT'}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
