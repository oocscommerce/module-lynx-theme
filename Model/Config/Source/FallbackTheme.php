<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Model\Config\Source;

use Magento\Framework\App\Area;
use Magento\Framework\Data\OptionSourceInterface;
use Magento\Theme\Model\ResourceModel\Theme\CollectionFactory;
use OOCS\LynxComponent\Helper\ThemeIdentity;

/**
 * The storefront themes a page can fall back to: every one but Lynx and its children, which would render Lynx again
 */
class FallbackTheme implements OptionSourceInterface
{
    /**
     * Built once: both config fields share this instance
     *
     * @var array<int,array{value:string,label:mixed}>|null
     */
    private ?array $options = null;

    /**
     * Theme collection factory, theme identity
     *
     * @param CollectionFactory $themeCollectionFactory
     * @param ThemeIdentity $themeIdentity
     */
    public function __construct(
        private readonly CollectionFactory $themeCollectionFactory,
        private readonly ThemeIdentity $themeIdentity,
    ) {
    }

    /**
     * Theme id => title, after an empty choice the required field rejects
     *
     * @return array<int, array{value: string, label: mixed}>
     */
    public function toOptionArray(): array
    {
        if ($this->options === null) {
            $this->options = [['value' => '', 'label' => __('-- Please Select --')]];
            $themes = $this->themeCollectionFactory->create()->addAreaFilter(Area::AREA_FRONTEND);
            foreach ($themes as $theme) {
                if (!$this->themeIdentity->isLynx($theme)) {
                    $this->options[] = ['value' => (string) $theme->getId(), 'label' => $theme->getThemeTitle()];
                }
            }
        }

        return $this->options;
    }
}
