<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Block\Html;

use Magento\Framework\View\Element\Template;

/**
 * Renders lynxStoreConfig, and caches it
 */
class StoreConfig extends Template
{
    private const CACHE_LIFETIME = 86400;

    /**
     * Get Cache Lifetime
     *
     * @return int
     */
    protected function getCacheLifetime(): int
    {
        return self::CACHE_LIFETIME;
    }

    /**
     * The currency being browsed decides priceFormat, so an entry rendered under one currency must never be served
     *
     * @return string[]
     */
    public function getCacheKeyInfo(): array
    {
        $key = parent::getCacheKeyInfo();
        $key[] = $this->_storeManager->getStore()->getCurrentCurrency()->getCode();

        return $key;
    }
}
