import React, { useState } from "react";
import { formatCurrency, formatDate } from "../utils/helpers";

const AllotmentChecker = ({ ipoId, symbol }) => {
  const [formData, setFormData] = useState({
    panNumber: "",
    applicationNumber: "",
    checkAll: false,
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value.toUpperCase(),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.panNumber.trim()) {
      setError("PAN number is required");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const params = new URLSearchParams({
        pan: formData.panNumber,
        ...(formData.applicationNumber && {
          application: formData.applicationNumber,
        }),
        ...(symbol && { symbol }),
        ...(ipoId && { ipoId }),
        live: "true",
      });

      const response = await fetch(`/api/allotment/check?${params}`);
      const data = await response.json();

      if (data.success) {
        setResults(data);
      } else {
        setError(data.error || "Failed to check allotment status");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getAllotmentStatusColor = (status) => {
    const colors = {
      ALLOTTED: "text-green-600 bg-green-50 border-green-200",
      NOT_ALLOTTED: "text-red-600 bg-red-50 border-red-200",
      REFUND: "text-orange-600 bg-orange-50 border-orange-200",
      PENDING: "text-yellow-600 bg-yellow-50 border-yellow-200",
    };
    return colors[status] || "text-gray-600 bg-gray-50 border-gray-200";
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Check Allotment Status
        </h3>
        <p className="text-sm text-gray-600">
          Enter your PAN number to check IPO allotment status
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PAN Number *
          </label>
          <input
            type="text"
            name="panNumber"
            value={formData.panNumber}
            onChange={handleInputChange}
            placeholder="Enter PAN Number (e.g., ABCDE1234F)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={10}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Application Number (Optional)
          </label>
          <input
            type="text"
            name="applicationNumber"
            value={formData.applicationNumber}
            onChange={handleInputChange}
            placeholder="Enter Application Number"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            name="checkAll"
            checked={formData.checkAll}
            onChange={handleInputChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label className="ml-2 text-sm text-gray-700">
            Check all IPOs for this PAN
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !formData.panNumber.trim()}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
              Checking...
            </div>
          ) : (
            "Check Allotment Status"
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Total Applications:</span>
                <div className="font-semibold">
                  {results.summary.totalApplications}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Allotted:</span>
                <div className="font-semibold text-green-600">
                  {results.summary.allottedApplications}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Total Invested:</span>
                <div className="font-semibold">
                  {formatCurrency(results.summary.totalInvested)}
                </div>
              </div>
              <div>
                <span className="text-gray-500">Total Profit/Loss:</span>
                <div
                  className={`font-semibold ${results.summary.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {results.summary.totalProfit >= 0 ? "+" : ""}
                  {formatCurrency(results.summary.totalProfit)}
                </div>
              </div>
            </div>
          </div>

          {/* Individual Results */}
          {results.data.length > 0 ? (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Allotment Details</h4>
              {results.data.map((result, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  {/* IPO Header */}
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-semibold text-gray-900">
                          {result.ipo.symbol}
                        </h5>
                        <p className="text-sm text-gray-600">
                          {result.ipo.name}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${getAllotmentStatusColor(result.allotmentStatus)}`}
                      >
                        {result.allotmentStatus}
                      </span>
                    </div>
                  </div>

                  {/* Allotment Details */}
                  <div className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Applied Quantity:</span>
                        <div className="font-medium">
                          {result.appliedQuantity} shares
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">
                          Allotted Quantity:
                        </span>
                        <div className="font-medium">
                          {result.allottedQuantity} shares
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Allotted Amount:</span>
                        <div className="font-medium">
                          {formatCurrency(result.allottedAmount)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Refund Amount:</span>
                        <div className="font-medium">
                          {formatCurrency(result.refundAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Profit/Loss Calculation */}
                    {result.profit !== undefined && result.ipo.listingGain && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Listing Performance:
                          </span>
                          <span
                            className={`text-sm font-medium ${result.ipo.listingGain.startsWith("+") ? "text-green-600" : "text-red-600"}`}
                          >
                            {result.ipo.listingGain}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-sm text-gray-500">
                            Your Profit/Loss:
                          </span>
                          <span
                            className={`text-sm font-semibold ${result.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {result.profit >= 0 ? "+" : ""}
                            {formatCurrency(result.profit)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Application Details */}
                    <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                      <div className="flex items-center justify-between">
                        <span>Application: {result.applicationNumber}</span>
                        <span>Category: {result.category}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">🔍</div>
              <p className="text-lg font-medium">No Allotment Found</p>
              <p className="text-sm">
                No IPO applications found for the provided PAN number.
              </p>
            </div>
          )}

          {/* Data Source Info */}
          {results.source && (
            <div className="text-xs text-gray-500 text-center pt-4 border-t">
              Data source:{" "}
              {results.source === "live_service" ? "Live Service" : "Database"}
              {results.timestamp &&
                ` • Updated: ${formatDate(results.timestamp)}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AllotmentChecker;
