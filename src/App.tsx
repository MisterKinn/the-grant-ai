import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import PaymentSuccess from "./pages/PaymentSuccess";
import NotFound from "./pages/NotFound";
import AppLayout from "./pages/AppLayout";
import DocumentEditor from "./pages/DocumentEditor";
import HwpxTestPage from "./pages/HwpxTestPage";
import { Analytics } from "@vercel/analytics/react";

const queryClient = new QueryClient();

const App = () => (
    <HelmetProvider>
        <Analytics />
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Index />} />
                        <Route
                            path="/payment-success"
                            element={<PaymentSuccess />}
                        />
                        <Route path="/hwpx-test" element={<HwpxTestPage />} />
                        <Route path="/app" element={<AppLayout />}>
                            <Route index element={null} />
                            <Route
                                path="document/:id"
                                element={<DocumentEditor />}
                            />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </TooltipProvider>
        </QueryClientProvider>
    </HelmetProvider>
);

export default App;
