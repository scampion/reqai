document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if your API runs elsewhere
    const entityNavList = document.getElementById('entity-nav-list');
    const contentArea = document.getElementById('content');
    const messagesArea = document.getElementById('messages');
    const downloadRtfButton = document.getElementById('download-rtf-button');


    let currentEntityType = null; // Keep track of the currently viewed entity type
    let currentDataCache = {}; // Simple cache for entity data

    // --- Utility Functions ---

    function showMessage(message, isError = false) {
        messagesArea.textContent = message;
        messagesArea.className = isError ? 'error' : 'success';
        // Auto-clear message after a few seconds
        setTimeout(() => {
            messagesArea.textContent = '';
            messagesArea.className = '';
        }, 5000);
    }

    function clearContent() {
        contentArea.innerHTML = ''; // Clear previous content
    }

    function setActiveNavButton(entityType) {
         // Remove active class from all buttons
        const buttons = entityNavList.querySelectorAll('button');
        buttons.forEach(btn => btn.classList.remove('active'));
        // Add active class to the clicked button
        const activeButton = entityNavList.querySelector(`button[data-entity="${entityType}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    // --- API Interaction ---

    async function fetchAPI(endpoint, options = {}) {
        const url = `${API_BASE_URL}${endpoint}`;
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                 let errorMsg = `HTTP error! Status: ${response.status}`;
                 try { // Try to get error message from response body
                     const errData = await response.json();
                     errorMsg += ` - ${errData.error || JSON.stringify(errData)}`;
                 } catch (e) { /* Ignore if response body isn't JSON */ }
                 throw new Error(errorMsg);
            }
            // Handle 204 No Content (for DELETE)
            if (response.status === 204) {
                return null; // Indicate success with no body
            }
            return await response.json(); // Parse JSON body for other successful responses
        } catch (error) {
            console.error('API Fetch Error:', error);
            showMessage(`API Error: ${error.message}`, true);
            throw error; // Re-throw for calling function to handle if needed
        }
    }

    // --- Rendering Functions ---

    function renderEntityList(entityType, items) {
        clearContent();
        currentEntityType = entityType; // Set current type
        setActiveNavButton(entityType);

        const title = entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let html = `<h2>${title}</h2>`;

        // --- NEW: Add Search UI for Requirements ---
        if (entityType === 'requirements') {
            html += `
                <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                    <input type="search" id="req-search-input" placeholder="Search requirement descriptions..." style="flex-grow: 1; padding: 8px;">
                    <button id="req-search-button" onclick="app.performSearch()" style="padding: 8px 12px;">Search</button>
                    <span id="req-search-status" style="font-size: 0.9em; color: #666;"></span>
                </div>
            `;
            // Trigger indexing if not already done (or if model wasn't ready before)
            ensureExtractorInitializedAndIndexRequirements(items);
        }
        // --- End of NEW Search UI ---

        // Add "Add New" button
        html += `<button class="add-button" data-entity="${entityType}" onclick="app.renderForm('${entityType}')">Add New ${title.slice(0,-1)}</button>`; // Assumes plural title

        // --- MODIFIED: Handle search results (items might be sorted with scores) ---
        const displayItems = items; // Use the potentially sorted items passed in
        const isSearchResult = displayItems.length > 0 && displayItems[0].hasOwnProperty('similarityScore');

        if (!displayItems || displayItems.length === 0) {
            html += '<p>No items found.</p>';
            // If it was a search, mention that
            if (document.getElementById('req-search-input')?.value) {
                 html += '<p>Your search returned no results.</p>';
            }
        } else {
            // Dynamically get headers from the keys of the first item
            const headers = Object.keys(items[0]);
            html += '<table><thead><tr>';
            // --- NEW: Add Similarity Score header if it's search results ---
            if (isSearchResult) {
                 html += `<th>Similarity</th>`;
            }
            headers.forEach(header => {
                 // Don't show the similarityScore as a regular column
                 if (header !== 'similarityScore') {
                     html += `<th>${header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`;
                 }
            });
            html += '<th>Actions</th>'; // Actions column header
            html += '</tr></thead><tbody>';

            displayItems.forEach(item => {
                html += '<tr>';
                const itemId = item.id || ''; // Ensure ID exists

                // --- NEW: Add Similarity Score cell ---
                if (isSearchResult) {
                    const score = (item.similarityScore * 100).toFixed(1); // Percentage
                    html += `<td style="text-align: right; font-weight: bold;">${score}%</td>`;
                }

                headers.forEach(header => {
                     // Don't show the similarityScore as a regular column value
                     if (header === 'similarityScore') return;

                    let value = item[header];
                    // Display complex types (arrays/objects) as formatted JSON in <pre>
                    if (typeof value === 'object' && value !== null) {
                        // Basic escaping for HTML within <pre>
                        const jsonString = JSON.stringify(value, null, 2)
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                         value = `<pre>${jsonString}</pre>`;
                    } else {
                         // Basic HTML escaping for simple values
                         value = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    }
                    html += `<td>${value}</td>`;
                });
                // Add Edit and Delete buttons with data attributes
                html += '<td class="actions">';
                if (itemId) {
                     html += `<button class="edit-button" data-entity="${entityType}" data-id="${itemId}" onclick="app.renderForm('${entityType}', '${itemId}')">Edit</button>`;
                     html += `<button class="delete-button" data-entity="${entityType}" data-id="${itemId}" onclick="app.deleteItem('${entityType}', '${itemId}')">Delete</button>`;
                } else {
                     html += '<span>(No ID)</span>';
                }
                html += '</td></tr>';
            });

            html += '</tbody></table>';
        }
        contentArea.innerHTML = html;
    }

    // --- MODIFIED: To handle both related Goals and Processes ---
    async function renderForm(entityType, itemId = null) {
        clearContent();
        currentEntityType = entityType; // Ensure type is set
        setActiveNavButton(entityType); // Keep nav active
        showMessage('Loading form...'); // Show loading message

        const isEdit = itemId !== null;
        const title = isEdit ? `Edit ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`
                             : `Add New ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`;

        let formHtml = `<div class="form-container"><h3>${title}</h3>`;
        formHtml += `<form id="entity-form">`;

        // --- MODIFIED: Fetch related data needed for dropdowns (Goals & Processes) ---
        let relatedData = {};
        if (entityType === 'requirements') {
            try {
                // Use Promise.all to fetch goals and processes concurrently
                const results = await Promise.all([
                    // Fetch goals (check cache first)
                    currentDataCache['goals_and_objectives'] ? Promise.resolve(currentDataCache['goals_and_objectives']) : fetchAPI('/entities/goals_and_objectives'),
                    // Fetch processes (check cache first)
                    currentDataCache['business_processes'] ? Promise.resolve(currentDataCache['business_processes']) : fetchAPI('/entities/business_processes')
                ]);

                const goals = results[0] || [];
                const processes = results[1] || [];

                // Cache fetched data
                currentDataCache['goals_and_objectives'] = goals;
                currentDataCache['business_processes'] = processes;

                // Prepare IDs for dropdowns
                relatedData.goalIds = goals.map(goal => goal.id).filter(id => id);
                relatedData.processIds = processes.map(proc => proc.id).filter(id => id);

                console.log("Goal IDs for dropdown:", relatedData.goalIds);
                console.log("Process IDs for dropdown:", relatedData.processIds);

            } catch (error) {
                console.error("Failed to fetch related data for dropdowns:", error);
                showMessage("Warning: Could not load related Goals or Processes for dropdowns.", true);
                // Proceed without dropdown data, will fallback to text inputs
            }
        }
        // Add more else if blocks here for other entity types needing related data

        // --- Build Form Fields function (accepts relatedData) ---
        const buildFormFields = (itemData, related) => {
             let fieldsHtml = '';
             if (isEdit) {
                  // Hidden field for ID during edit
                  fieldsHtml += `<input type="hidden" name="id" value="${itemId}">`;
                  fieldsHtml += `<p><strong>ID:</strong> ${itemId}</p>`; // Display ID
             }

             // Determine field keys: Use itemData keys, exclude 'id' for display
             const keys = Object.keys(itemData).filter(key => !(isEdit && key === 'id'));

             keys.forEach(key => {
                 const currentValue = itemData[key]; // Value from the item being edited or default
                 const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                 const fieldId = `field_${key}`;

                 fieldsHtml += `<div><label for="${fieldId}">${label}:</label>`;

                // --- Dropdown for Related Goal ID ---
                if (key === 'related_goal_id' && entityType === 'requirements' && related?.goalIds?.length > 0) {
                    fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                    fieldsHtml += `<option value="">-- Select Goal --</option>`; // Default empty option
                    const goals = currentDataCache['goals_and_objectives'] || [];
                    goals.forEach(goal => {
                        if (!goal.id) return;
                        const selectedAttr = (goal.id === currentValue) ? ' selected' : '';
                        const description = goal.description ? goal.description.substring(0, 50) + (goal.description.length > 50 ? '...' : '') : '';
                        fieldsHtml += `<option value="${goal.id}"${selectedAttr}>${goal.id} - ${description}</option>`;
                    });
                    fieldsHtml += `</select>`;
                }
                // --- Dropdown for Related Process ID ---
                else if (key === 'related_process_id' && entityType === 'requirements' && related?.processIds?.length > 0) {
                    fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                    fieldsHtml += `<option value="">-- Select Process --</option>`; // Default empty option
                    const processes = currentDataCache['business_processes'] || [];
                    processes.forEach(process => {
                        if (!process.id) return;
                        const selectedAttr = (process.id === currentValue) ? ' selected' : '';
                        const description = process.description ? process.description.substring(0, 50) + (process.description.length > 50 ? '...' : '') : '';
                        fieldsHtml += `<option value="${process.id}"${selectedAttr}>${process.id} - ${description}</option>`;
                    });
                    fieldsHtml += `</select>`;
                }
                // --- End of Dropdown Logic ---
                // Fallback to existing logic for other fields
                else if (typeof currentValue === 'object' && currentValue !== null) {
                      const jsonString = JSON.stringify(currentValue, null, 2);
                      fieldsHtml += `<textarea id="${fieldId}" name="${key}" rows="5">${jsonString}</textarea>`;
                      fieldsHtml += `<small>Edit as JSON</small>`;
                 } else if (typeof currentValue === 'boolean') {
                      fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                      fieldsHtml += `<option value="true" ${currentValue ? 'selected' : ''}>True</option>`;
                      fieldsHtml += `<option value="false" ${!currentValue ? 'selected' : ''}>False</option>`;
                      fieldsHtml += `</select>`;
                 }
                 else {
                      const escapedValue = String(currentValue ?? '').replace(/"/g, '&quot;'); // Use nullish coalescing for default empty string
                      fieldsHtml += `<input type="text" id="${fieldId}" name="${key}" value="${escapedValue}">`;
                 }
                 fieldsHtml += `</div>`;
             });

             formHtml += fieldsHtml;
             formHtml += `<button type="submit">${isEdit ? 'Update Item' : 'Add Item'}</button>`;
             formHtml += `<button type="button" class="cancel-button" onclick="app.loadEntityList('${entityType}')">Cancel</button>`;
             formHtml += `</form></div>`;
             contentArea.innerHTML = formHtml;
             showMessage(''); // Clear loading message

             // Add submit event listener AFTER the form is in the DOM
             const formElement = document.getElementById('entity-form');
             if (formElement) {
                formElement.addEventListener('submit', (event) => handleFormSubmit(event, entityType, isEdit));
             } else {
                 console.error("Could not find form element #entity-form to attach listener.");
             }
        };

        // --- Fetch item data (for edit) or sample structure (for add) ---
        try {
            let itemDataForForm;
            if (isEdit) {
                // Fetch the specific item data for editing
                itemDataForForm = await fetchAPI(`/entities/${entityType}/${itemId}`);
                if (!itemDataForForm) {
                     throw new Error(`Item ${itemId} not found.`);
                }
            } else {
                // For 'Add', create a structure with empty/default values based on a sample item
                const sampleItems = currentDataCache[entityType] || await fetchAPI(`/entities/${entityType}?limit=1`); // Fetch one if not cached
                const sampleItem = sampleItems?.[0] || {}; // Use first item or empty object

                itemDataForForm = {};
                let keysToUse = Object.keys(sampleItem);
                // Ensure essential requirement fields exist even if sample is empty
                 if(entityType === 'requirements') {
                     const requiredKeys = ['description', 'type', 'priority', 'related_goal_id', 'related_process_id'];
                     requiredKeys.forEach(reqKey => {
                         if (!keysToUse.includes(reqKey)) {
                             keysToUse.push(reqKey);
                         }
                     });
                 }
                // Add more defaults for other types if needed

                keysToUse.forEach(key => {
                    if (key !== 'id') { // Don't include 'id' field for adding
                        const sampleValue = sampleItem[key];
                        if (typeof sampleValue === 'object' && sampleValue !== null) {
                            itemDataForForm[key] = Array.isArray(sampleValue) ? [] : {}; // Empty array/object
                        } else if (typeof sampleValue === 'boolean') {
                            itemDataForForm[key] = false; // Default bool
                        } else {
                            // Ensure related ID fields start empty for selection
                            if (key === 'related_goal_id' || key === 'related_process_id') {
                                 itemDataForForm[key] = '';
                            } else {
                                 itemDataForForm[key] = sampleValue ?? ''; // Default empty string from sample or truly empty
                            }
                        }
                    }
                });
            }
            // --- Pass relatedData to buildFormFields ---
            buildFormFields(itemDataForForm, relatedData);

        } catch (error) {
            console.error("Error preparing form:", error);
            showMessage(`Error loading form data: ${error.message}`, true);
            contentArea.innerHTML = `<p style="color:red;">Could not load form.</p>`; // Show error in content area
        }
    }


    // --- Event Handlers ---

    async function handleFormSubmit(event, entityType, isEdit) {
        event.preventDefault(); // Prevent default browser submission
        const form = event.target;
        const formData = new FormData(form);
        const dataPayload = {};

        formData.forEach((value, key) => {
            // Attempt to parse JSON fields (basic check for starting with { or [)
            const trimmedValue = typeof value === 'string' ? value.trim() : value;
            // Check if the original element was a textarea suggesting JSON, or if string looks like JSON
            const element = form.elements[key];
            const mightBeJson = (element?.tagName === 'TEXTAREA') || (typeof trimmedValue === 'string' && (trimmedValue.startsWith('{') || trimmedValue.startsWith('[')));

            if (mightBeJson) {
                try {
                    dataPayload[key] = JSON.parse(trimmedValue);
                } catch (e) {
                    console.warn(`Could not parse JSON for key '${key}', sending as string: ${trimmedValue}`);
                    dataPayload[key] = trimmedValue; // Send as string if invalid JSON
                }
            } else if (element?.tagName === 'SELECT' && (value === 'true' || value === 'false')) {
                 dataPayload[key] = (value === 'true'); // Convert boolean strings
            }
            // Ensure empty selection in dropdowns becomes null or empty string as appropriate for backend
            else if (element?.tagName === 'SELECT' && value === '') {
                 dataPayload[key] = null; // Or "" depending on backend expectation for empty relation
            }
            else {
                dataPayload[key] = value;
            }
        });

        const itemId = isEdit ? formData.get('id') : null; // Get ID if editing
        const method = isEdit ? 'PUT' : 'POST';
        const endpoint = isEdit ? `/entities/${entityType}/${itemId}` : `/entities/${entityType}`;

        try {
            showMessage('Saving...'); // Provide feedback
            const result = await fetchAPI(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataPayload)
            });
            showMessage(`Item ${isEdit ? 'updated' : 'added'} successfully!`, false);
            // Clear relevant caches and reload list
            delete currentDataCache[entityType];
            if (entityType === 'requirements') {
                 delete currentDataCache['goals_and_objectives'];
                 delete currentDataCache['business_processes'];
            }
            loadEntityList(entityType);
        } catch (error) {
            // Error already shown by fetchAPI, maybe add more context
             showMessage(`Failed to ${isEdit ? 'update' : 'add'} item. ${error.message}`, true);
        }
    }

    async function deleteItem(entityType, itemId) {
        // Get current time in Brussels
        const now = new Date();
        const options = { timeZone: 'Europe/Brussels', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
        const timeString = now.toLocaleTimeString('en-GB', options);
        const dateString = now.toLocaleDateString('en-CA'); // YYYY-MM-DD

        if (confirm(`(${dateString} ${timeString} Brussels Time)\nAre you sure you want to delete item ${itemId} from ${entityType}?`)) {
            try {
                 showMessage('Deleting...');
                 await fetchAPI(`/entities/${entityType}/${itemId}`, { method: 'DELETE' });
                 showMessage(`Item ${itemId} deleted successfully.`, false);
                 // Clear cache for this type and reload list
                 delete currentDataCache[entityType];
                 loadEntityList(entityType);
            } catch (error) {
                 // Error message already shown by fetchAPI
                  showMessage(`Failed to delete item ${itemId}. ${error.message}`, true);
            }
        }
    }

    async function loadEntityList(entityType) {
        showMessage('Loading data...');
        try {
            // Check cache first
            if (!currentDataCache[entityType]) {
                const data = await fetchAPI(`/entities/${entityType}`);
                if (!data) {
                    throw new Error(`No data returned for ${entityType}`);
                }
                currentDataCache[entityType] = data;
            }
            
            const items = currentDataCache[entityType];
            if (!items) {
                throw new Error(`No items found for ${entityType}`);
            }

            // Render the list
            renderEntityList(entityType, items);
            showMessage(''); // Clear loading message

        } catch (error) {
            console.error(`Error loading ${entityType}:`, error);
            showMessage(`Failed to load ${entityType}: ${error.message}`, true);
            contentArea.innerHTML = `
                <div style="color: red; margin: 20px;">
                    <p>Failed to load ${entityType.replace(/_/g, ' ')} data.</p>
                    <p>Error: ${error.message}</p>
                    <button onclick="app.loadEntityList('${entityType}')">Retry</button>
                </div>
            `;
        }
    }


    // --- Initialization ---

    async function initialize() {
        try {
            const entityTypes = await fetchAPI('/entity_types');
            entityNavList.innerHTML = ''; // Clear 'Loading...'
            const emojiMap = {
                'stakeholders': '👥',
                'goals_and_objectives': '🎯', 
                'business_processes': '🔄',
                'requirements': '📋',
                'systems_and_applications': '💻',
                'data_entities': '🗄️',
                'risks_and_constraints': '⚠️',
                'metrics_and_kpis': '📊'
            };
            entityTypes.sort().forEach(type => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                const emoji = emojiMap[type] || '📌';
                button.textContent = `${emoji} ${type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
                button.dataset.entity = type; // Store entity type in data attribute
                button.onclick = () => loadEntityList(type);
                li.appendChild(button);
                entityNavList.appendChild(li);
            });
        } catch (error) {
            entityNavList.innerHTML = '<li>Error loading entity types. Is the API running?</li>';
            console.error("Initialization failed:", error);
            showMessage("Could not load entity types from API.", true);
        }

        // --- NEW: Add listener for Download button ---
        if (downloadRtfButton) {
            downloadRtfButton.addEventListener('click', () => {
                showMessage('Preparing download...');
                // Simply navigate to the export endpoint. The browser will handle the download.
                window.location.href = `${API_BASE_URL}/export/rtf`;
                // Clear message after a short delay, as we don't get explicit success feedback here easily
                 setTimeout(() => showMessage(''), 2000);
            });
        } else {
            console.error("Download button not found.");
        }
    }

    // --- Text Embedding and Search Functionality ---
    let featureExtractor = null;
    let requirementsIndex = null;
    let transformersInitialized = false;

    async function ensureExtractorInitializedAndIndexRequirements(requirements) {
        if (!transformersInitialized) {
            try {
                showMessage('Loading text embedding model...');
                // Dynamically import Transformers.js
                const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
                featureExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
                transformersInitialized = true;
                showMessage('Text embedding model ready');
            } catch (error) {
                console.error('Failed to initialize feature extractor:', error);
                showMessage('Failed to initialize search capabilities', true);
                return false;
            }
        }

        if (requirements && requirements.length > 0) {
            try {
                showMessage('Indexing requirements for search...');
                requirementsIndex = {};
                
                // Create embeddings for all requirement descriptions
                const texts = requirements.map(req => req.description || '');
                const embeddings = await featureExtractor(texts, { pooling: 'mean', normalize: true });
                
                // Store embeddings with their requirement IDs
                requirements.forEach((req, i) => {
                    if (req.id && req.description) {
                        requirementsIndex[req.id] = {
                            embedding: embeddings[i].data,
                            requirement: req
                        };
                    }
                });
                
                showMessage('Requirements indexed for search');
                return true;
            } catch (error) {
                console.error('Failed to index requirements:', error);
                showMessage('Failed to index requirements for search', true);
                return false;
            }
        }
        return false;
    }

    async function performSearch() {
        const searchInput = document.getElementById('req-search-input');
        const searchTerm = searchInput?.value.trim();
        const searchStatus = document.getElementById('req-search-status');
        
        if (!searchTerm) {
            searchStatus.textContent = 'Please enter a search term';
            return;
        }

        try {
            searchStatus.textContent = 'Searching...';
            // First ensure we have embeddings for all requirements
            const allRequirements = currentDataCache['requirements'] || await fetchAPI('/entities/requirements');
            const initialized = await ensureExtractorInitializedAndIndexRequirements(allRequirements);
            
            if (!initialized || !featureExtractor) {
                throw new Error('Search functionality not available');
            }

            // Generate embedding for search query
            const queryEmbedding = await featureExtractor(searchTerm, { pooling: 'mean', normalize: true });
            
            // Calculate cosine similarity between query and all requirements
            const results = [];
            for (const reqId in requirementsIndex) {
                const { embedding, requirement } = requirementsIndex[reqId];
                const similarity = cosineSimilarity(queryEmbedding.data, embedding);
                
                if (similarity > 0.3) { // Only include results with reasonable similarity
                    results.push({
                        ...requirement,
                        similarityScore: similarity
                    });
                }
            }

            // Sort by similarity score (highest first)
            results.sort((a, b) => b.similarityScore - a.similarityScore);
            
            if (results && results.length > 0) {
                renderEntityList('requirements', results);
                searchStatus.textContent = `Found ${results.length} matching requirements`;
            } else {
                renderEntityList('requirements', []);
                searchStatus.textContent = 'No matching requirements found';
            }
        } catch (error) {
            console.error('Search failed:', error);
            searchStatus.textContent = 'Search failed - see console';
            showMessage(`Search error: ${error.message}`, true);
        }
    }

    // Utility function to calculate cosine similarity between vectors
    function cosineSimilarity(a, b) {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            magnitudeA += a[i] * a[i];
            magnitudeB += b[i] * b[i];
        }
        
        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);
        
        return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
    }

    // Expose functions needed by inline HTML event handlers (onclick)
    window.app = {
        renderForm,
        deleteItem,
        loadEntityList,
        performSearch
    };

    // Start the application
    // Initialize the feature extractor lazily when requirements are first viewed,
    // or potentially trigger it here if requirements are the default view.
    // For now, it's triggered by loadEntityList('requirements').
    initialize();
});
