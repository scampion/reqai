document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if your API runs elsewhere
    const entityNavList = document.getElementById('entity-nav-list');
    const contentArea = document.getElementById('content');
    const messagesArea = document.getElementById('messages');

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
        html += `<button class="add-button" onclick="app.renderForm('${entityType}')">Add New ${title.slice(0,-1)}</button>`; // Assumes plural title

        if (!items || items.length === 0) {
            html += '<p>No items found.</p>';
        } else {
            // Dynamically get headers from the keys of the first item
            const headers = Object.keys(items[0]);
            html += '<table><thead><tr>';
            headers.forEach(header => {
                 html += `<th>${header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`;
            });
            html += '<th>Actions</th>';
            html += '</tr></thead><tbody>';

            items.forEach(item => {
                html += '<tr>';
                const itemId = item.id || ''; // Ensure ID exists
                headers.forEach(header => {
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
                // Add Edit and Delete buttons
                html += '<td class="actions">';
                if (itemId) {
                     html += `<button class="edit-button" onclick="app.renderForm('${entityType}', '${itemId}')">Edit</button>`;
                     html += `<button class="delete-button" onclick="app.deleteItem('${entityType}', '${itemId}')">Delete</button>`;
                } else {
                     html += '<span>(No ID)</span>';
                }
                html += '</td></tr>';
            });

            html += '</tbody></table>';
        }
        contentArea.innerHTML = html;
    }

    function renderForm(entityType, itemId = null) {
        clearContent();
        currentEntityType = entityType; // Ensure type is set
        setActiveNavButton(entityType); // Keep nav active

        const isEdit = itemId !== null;
        const title = isEdit ? `Edit ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`
                             : `Add New ${entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0,-1)}`;

        let formHtml = `<div class="form-container"><h3>${title}</h3>`;
        formHtml += `<form id="entity-form">`;

        // Function to actually build the form fields once we have the item data (or sample structure)
        const buildFormFields = (itemData) => {
             let fieldsHtml = '';
             if (isEdit) {
                  // Hidden field for ID during edit
                  fieldsHtml += `<input type="hidden" name="id" value="${itemId}">`;
                  fieldsHtml += `<p><strong>ID:</strong> ${itemId}</p>`; // Display ID
             }

             // Determine field keys: Use itemData keys, exclude 'id' for display
             const keys = Object.keys(itemData).filter(key => !(isEdit && key === 'id'));

             keys.forEach(key => {
                 const value = itemData[key];
                 const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                 const fieldId = `field_${key}`;

                 fieldsHtml += `<div><label for="${fieldId}">${label}:</label>`;

                 // Render JSON for objects/arrays in textarea
                 if (typeof value === 'object' && value !== null) {
                      const jsonString = JSON.stringify(value, null, 2);
                      fieldsHtml += `<textarea id="${fieldId}" name="${key}" rows="5">${jsonString}</textarea>`;
                      fieldsHtml += `<small>Edit as JSON</small>`;
                 } else if (typeof value === 'boolean') {
                      fieldsHtml += `<select id="${fieldId}" name="${key}">`;
                      fieldsHtml += `<option value="true" ${value ? 'selected' : ''}>True</option>`;
                      fieldsHtml += `<option value="false" ${!value ? 'selected' : ''}>False</option>`;
                      fieldsHtml += `</select>`;
                 }
                 // Add more specific input types if needed (date, number, etc.) based on key or value type
                 // else if (key.includes('date') || key.includes('deadline')) { ... type="date" ... }
                 else {
                      const escapedValue = String(value).replace(/"/g, '&quot;'); // Escape quotes for value attribute
                      fieldsHtml += `<input type="text" id="${fieldId}" name="${key}" value="${escapedValue}">`;
                 }
                 fieldsHtml += `</div>`;
             });

             formHtml += fieldsHtml;
             formHtml += `<button type="submit">${isEdit ? 'Update Item' : 'Add Item'}</button>`;
             formHtml += `<button type="button" class="cancel-button" onclick="app.loadEntityList('${entityType}')">Cancel</button>`;
             formHtml += `</form></div>`;
             contentArea.innerHTML = formHtml;

             // Add submit event listener AFTER the form is in the DOM
             const formElement = document.getElementById('entity-form');
             formElement.addEventListener('submit', (event) => handleFormSubmit(event, entityType, isEdit));
        };

        if (isEdit) {
            // Fetch the specific item data for editing
            fetchAPI(`/entities/${entityType}/${itemId}`)
                .then(item => {
                    if (item) {
                        buildFormFields(item);
                    } else {
                        showMessage(`Failed to load item ${itemId} for editing.`, true);
                    }
                })
                .catch(() => showMessage(`Error fetching item ${itemId}.`, true));
        } else {
            // For 'Add', we need a sample structure. Try getting the first item from cache/API.
            const sampleItem = currentDataCache[entityType]?.[0] || {};
            // Create a structure with empty values based on sample keys
            const newItemStructure = {};
            // Use a default set of fields if no sample exists, or prompt user?
            // For now, derive from sample, falling back to a few basic fields
             let keysToUse = Object.keys(sampleItem);
             if(keysToUse.length === 0) keysToUse = ['name', 'description']; // Minimal fallback

            keysToUse.forEach(key => {
                 if (key !== 'id') { // Don't include 'id' field for adding
                     const sampleValue = sampleItem[key];
                     if(typeof sampleValue === 'object' && sampleValue !== null) {
                         newItemStructure[key] = Array.isArray(sampleValue) ? [] : {}; // Empty array/object
                     } else if (typeof sampleValue === 'boolean'){
                         newItemStructure[key] = false; // Default bool
                     } else {
                         newItemStructure[key] = ''; // Default empty string
                     }
                 }
            });
             buildFormFields(newItemStructure);
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
            if (typeof trimmedValue === 'string' && (trimmedValue.startsWith('{') || trimmedValue.startsWith('['))) {
                try {
                    dataPayload[key] = JSON.parse(trimmedValue);
                } catch (e) {
                    console.warn(`Could not parse JSON for key '${key}', sending as string.`);
                    dataPayload[key] = trimmedValue; // Send as string if invalid JSON
                }
            } else if (form.elements[key]?.type === 'select' && (value === 'true' || value === 'false')) {
                 dataPayload[key] = (value === 'true'); // Convert boolean strings
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
            // Clear cache for this type and reload list
            delete currentDataCache[entityType];
            loadEntityList(entityType);
        } catch (error) {
            // Error already shown by fetchAPI, maybe add more context
             showMessage(`Failed to ${isEdit ? 'update' : 'add'} item. ${error.message}`, true);
        }
    }

    async function deleteItem(entityType, itemId) {
        if (confirm(`Are you sure you want to delete item ${itemId} from ${entityType}?`)) {
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
             const items = await fetchAPI(`/entities/${entityType}`);
             currentDataCache[entityType] = items; // Cache the loaded data
             renderEntityList(entityType, items);
             showMessage(''); // Clear loading message
         } catch (error) {
              // Error message shown by fetchAPI
              contentArea.innerHTML = `<p style="color: red;">Failed to load data for ${entityType}.</p>`;
         }
    }

    // --- Initialization ---

    async function initialize() {
        try {
            const entityTypes = await fetchAPI('/entity_types');
            entityNavList.innerHTML = ''; // Clear 'Loading...'
            entityTypes.sort().forEach(type => {
                const li = document.createElement('li');
                const button = document.createElement('button');
                button.textContent = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    }

    // Expose functions needed by inline HTML event handlers (onclick)
    window.app = {
        renderForm,
        deleteItem,
        loadEntityList
    };

    // Start the application
    initialize();
});


