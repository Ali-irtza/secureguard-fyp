import { createContext, useContext, useState, PropsWithChildren, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-config";

export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface ContactFormContextValue {
  formData: ContactFormData;
  setFormData: Dispatch<SetStateAction<ContactFormData>>;
  isLoading: boolean;
  submitContact: () => Promise<boolean>;
  resetForm: () => void;
}

const initialFormData: ContactFormData = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

const ContactFormContext = createContext<ContactFormContextValue | undefined>(undefined);

export const ContactFormProvider = ({ children }: PropsWithChildren<{}>) => {
  const [formData, setFormData] = useState<ContactFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);

  const submitContact = async (): Promise<boolean> => {
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(json.detail || "Failed to send message. Please try again.");
        return false;
      }

      toast.success(`Message sent! We'll get back to you soon. (ID: ${json.id?.slice(0, 8) ?? "..."})`);
      setFormData(initialFormData);
      return true;
    } catch (error) {
      console.error("Contact form submit error:", error);
      toast.error("Failed to send message. Please check your connection and try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => setFormData(initialFormData);

  return (
    <ContactFormContext.Provider
      value={{ formData, setFormData, isLoading, submitContact, resetForm }}
    >
      {children}
    </ContactFormContext.Provider>
  );
};

export const useContactFormContext = () => {
  const context = useContext(ContactFormContext);
  if (!context) {
    throw new Error("useContactFormContext must be used within ContactFormProvider");
  }
  return context;
};
